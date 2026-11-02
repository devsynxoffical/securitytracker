using System.Text;
using CompanyOS.Core.Abstractions;
using CompanyOS.Shared.Models;
using CompanyOS.Shared.Protocol;
using Microsoft.Data.Sqlite;

namespace CompanyOS.Core.Storage;

/// <summary>
/// SQLite queue (09 section 4): tables segments, tamper, state. The JSON payload of every row is encrypted
/// with <see cref="IPayloadCipher"/>; only ids, shift id and timestamps are plain so ordering and acks work
/// without decryption. Rows are deleted only on ack. Writes are batched by the engine (one checkpoint per
/// 30 s and one insert per segment close) to respect the disk budget in 09 section 8.
/// </summary>
public sealed class SqliteQueueStore : IQueueStore, IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly IPayloadCipher _cipher;
    private readonly string _path;
    private readonly object _gate = new();

    private const string OpenSegmentKey = "open_segment";

    public SqliteQueueStore(string path, IPayloadCipher cipher)
    {
        _path = path;
        _cipher = cipher;
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        _conn = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadWriteCreate, Pooling = false }.ToString());
        _conn.Open();
        Exec("PRAGMA journal_mode=WAL;");
        Exec("PRAGMA synchronous=NORMAL;");
        Exec("""
             CREATE TABLE IF NOT EXISTS segments (
               id TEXT PRIMARY KEY,
               shift_id TEXT NOT NULL,
               started_at TEXT NOT NULL,
               payload BLOB NOT NULL,
               created_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS ix_segments_started ON segments(started_at);
             CREATE TABLE IF NOT EXISTS tamper (
               id TEXT PRIMARY KEY,
               payload BLOB NOT NULL,
               created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS state (
               key TEXT PRIMARY KEY,
               value TEXT
             );
             """);
    }

    public void InsertSegment(ActivitySegment segment)
    {
        var payload = _cipher.Encrypt(Encoding.UTF8.GetBytes(PipeJson.Serialize(segment)));
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "INSERT OR IGNORE INTO segments(id, shift_id, started_at, payload, created_at) VALUES ($id, $shift, $started, $payload, $created)";
            cmd.Parameters.AddWithValue("$id", segment.Id.ToString());
            cmd.Parameters.AddWithValue("$shift", segment.ShiftId.ToString());
            cmd.Parameters.AddWithValue("$started", Iso(segment.StartedAt));
            cmd.Parameters.AddWithValue("$payload", payload);
            cmd.Parameters.AddWithValue("$created", Iso(DateTime.UtcNow));
            cmd.ExecuteNonQuery();
        }
    }

    public void CheckpointOpenSegment(ActivitySegment? segment)
        => SetState(OpenSegmentKey, segment is null ? null : Convert.ToBase64String(_cipher.Encrypt(Encoding.UTF8.GetBytes(PipeJson.Serialize(segment)))));

    public ActivitySegment? ReadOpenSegmentCheckpoint()
    {
        var raw = GetState(OpenSegmentKey);
        if (string.IsNullOrEmpty(raw)) return null;
        try
        {
            var json = Encoding.UTF8.GetString(_cipher.Decrypt(Convert.FromBase64String(raw)));
            return PipeJson.Deserialize<ActivitySegment>(json);
        }
        catch
        {
            return null; // corrupt checkpoint: lose at most 30 s, never crash
        }
    }

    public IReadOnlyList<ActivitySegment> PullSegments(int max)
    {
        var list = new List<ActivitySegment>();
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "SELECT payload FROM segments ORDER BY started_at ASC, id ASC LIMIT $max";
            cmd.Parameters.AddWithValue("$max", Math.Clamp(max, 1, 5000));
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                var blob = (byte[])reader[0];
                try
                {
                    var seg = PipeJson.Deserialize<ActivitySegment>(Encoding.UTF8.GetString(_cipher.Decrypt(blob)));
                    if (seg is not null) list.Add(seg);
                }
                catch
                {
                    // Undecryptable row (key lost): skip, it will be reported by count mismatch.
                }
            }
        }
        return list;
    }

    public int AckSegments(IEnumerable<Guid> ids) => DeleteByIds("segments", ids);

    public int CountSegments() => Scalar<long>("SELECT COUNT(*) FROM segments");

    public void InsertTamper(TamperEvent evt)
    {
        var payload = _cipher.Encrypt(Encoding.UTF8.GetBytes(PipeJson.Serialize(evt)));
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "INSERT OR IGNORE INTO tamper(id, payload, created_at) VALUES ($id, $payload, $created)";
            cmd.Parameters.AddWithValue("$id", evt.Id.ToString());
            cmd.Parameters.AddWithValue("$payload", payload);
            cmd.Parameters.AddWithValue("$created", Iso(DateTime.UtcNow));
            cmd.ExecuteNonQuery();
        }
    }

    public IReadOnlyList<TamperEvent> PullTamper(int max)
    {
        var list = new List<TamperEvent>();
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "SELECT payload FROM tamper ORDER BY created_at ASC LIMIT $max";
            cmd.Parameters.AddWithValue("$max", Math.Clamp(max, 1, 1000));
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                try
                {
                    var evt = PipeJson.Deserialize<TamperEvent>(Encoding.UTF8.GetString(_cipher.Decrypt((byte[])reader[0])));
                    if (evt is not null) list.Add(evt);
                }
                catch { /* skip undecryptable */ }
            }
        }
        return list;
    }

    public int AckTamper(IEnumerable<Guid> ids) => DeleteByIds("tamper", ids);

    public int CountTamper() => Scalar<long>("SELECT COUNT(*) FROM tamper");

    public string? GetState(string key)
    {
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "SELECT value FROM state WHERE key = $key";
            cmd.Parameters.AddWithValue("$key", key);
            var v = cmd.ExecuteScalar();
            return v is null or DBNull ? null : (string)v;
        }
    }

    public void SetState(string key, string? value)
    {
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            if (value is null)
            {
                cmd.CommandText = "DELETE FROM state WHERE key = $key";
                cmd.Parameters.AddWithValue("$key", key);
            }
            else
            {
                cmd.CommandText = "INSERT INTO state(key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
                cmd.Parameters.AddWithValue("$key", key);
                cmd.Parameters.AddWithValue("$value", value);
            }
            cmd.ExecuteNonQuery();
        }
    }

    public long SizeBytes()
    {
        try
        {
            long total = 0;
            foreach (var suffix in new[] { "", "-wal" })
            {
                var f = new FileInfo(_path + suffix);
                if (f.Exists) total += f.Length;
            }
            return total;
        }
        catch { return 0; }
    }

    public DateTime? OldestSegmentStartedAt()
    {
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = "SELECT MIN(started_at) FROM segments";
            var v = cmd.ExecuteScalar();
            if (v is null or DBNull) return null;
            return DateTime.TryParse((string)v, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt) ? dt.ToUniversalTime() : null;
        }
    }

    public void Dispose() => _conn.Dispose();

    // ---- helpers ------------------------------------------------------------------------------

    private int DeleteByIds(string table, IEnumerable<Guid> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;
        var deleted = 0;
        lock (_gate)
        {
            using var tx = _conn.BeginTransaction();
            foreach (var chunk in list.Chunk(500))
            {
                using var cmd = _conn.CreateCommand();
                cmd.Transaction = tx;
                var names = new List<string>();
                for (var i = 0; i < chunk.Length; i++)
                {
                    names.Add($"$p{i}");
                    cmd.Parameters.AddWithValue($"$p{i}", chunk[i].ToString());
                }
                cmd.CommandText = $"DELETE FROM {table} WHERE id IN ({string.Join(",", names)})";
                deleted += cmd.ExecuteNonQuery();
            }
            tx.Commit();
        }
        return deleted;
    }

    private void Exec(string sql)
    {
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private T Scalar<T>(string sql)
    {
        lock (_gate)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = sql;
            return (T)Convert.ChangeType(cmd.ExecuteScalar()!, typeof(T))!;
        }
    }

    private static string Iso(DateTime dt) => dt.ToUniversalTime().ToString("O");
}

/// <summary>No-op cipher for tests only. The agent always uses the DPAPI protected AES-GCM cipher.</summary>
public sealed class PlainCipher : IPayloadCipher
{
    public byte[] Encrypt(byte[] plaintext) => plaintext;
    public byte[] Decrypt(byte[] ciphertext) => ciphertext;
}

/// <summary>AES-256-GCM over the payload with a caller supplied key (key protection is the agent's job).</summary>
public sealed class AesGcmCipher : IPayloadCipher
{
    private readonly byte[] _key;
    private const int NonceSize = 12;
    private const int TagSize = 16;

    public AesGcmCipher(byte[] key32)
    {
        if (key32.Length != 32) throw new ArgumentException("AES-256 key must be 32 bytes", nameof(key32));
        _key = key32;
    }

    public byte[] Encrypt(byte[] plaintext)
    {
        var nonce = System.Security.Cryptography.RandomNumberGenerator.GetBytes(NonceSize);
        var cipher = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        using var aes = new System.Security.Cryptography.AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintext, cipher, tag);
        var out_ = new byte[NonceSize + TagSize + cipher.Length];
        Buffer.BlockCopy(nonce, 0, out_, 0, NonceSize);
        Buffer.BlockCopy(tag, 0, out_, NonceSize, TagSize);
        Buffer.BlockCopy(cipher, 0, out_, NonceSize + TagSize, cipher.Length);
        return out_;
    }

    public byte[] Decrypt(byte[] ciphertext)
    {
        if (ciphertext.Length < NonceSize + TagSize) throw new System.Security.Cryptography.CryptographicException("payload too short");
        var nonce = ciphertext.AsSpan(0, NonceSize);
        var tag = ciphertext.AsSpan(NonceSize, TagSize);
        var body = ciphertext.AsSpan(NonceSize + TagSize);
        var plain = new byte[body.Length];
        using var aes = new System.Security.Cryptography.AesGcm(_key, TagSize);
        aes.Decrypt(nonce, body, tag, plain);
        return plain;
    }
}
