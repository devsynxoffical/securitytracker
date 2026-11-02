using System.Text.Json;
using System.Text.Json.Serialization;
using CompanyOS.Shared.Models;

namespace CompanyOS.Shared.Protocol;

/// <summary>Command names, app -> agent (09 section 4). Plus one internal command from the native host.</summary>
public static class Commands
{
    public const string Hello = "hello";
    public const string SetAnchor = "setAnchor";
    public const string SetConfig = "setConfig";
    public const string StartTracking = "startTracking";
    public const string PauseTracking = "pauseTracking";
    public const string ResumeTracking = "resumeTracking";
    public const string StopTracking = "stopTracking";
    public const string PullSegments = "pullSegments";
    public const string AckSegments = "ackSegments";
    public const string PullTamper = "pullTamper";
    public const string AckTamper = "ackTamper";
    public const string Status = "status";

    /// <summary>Sent by CompanyOS.NativeHost on behalf of the browser extension (09 section 5).</summary>
    public const string ExtensionDomain = "extensionDomain";
}

/// <summary>Event names, agent -> app (09 section 4).</summary>
public static class Events
{
    public const string LongIdleEnded = "longIdleEnded";
    public const string QueueWarning = "queueWarning";
    public const string StateChanged = "stateChanged";
}

/// <summary>One JSON line from the app. <c>Payload</c> is parsed per command.</summary>
public sealed class PipeRequest
{
    public string Command { get; set; } = string.Empty;
    /// <summary>Optional correlation id echoed in the response.</summary>
    public string? Id { get; set; }
    public JsonElement? Payload { get; set; }
}

/// <summary>One JSON line to the app. Either a response (has Command) or an event (has Event).</summary>
public sealed class PipeResponse
{
    public string? Command { get; set; }
    public string? Id { get; set; }
    public bool Ok { get; set; }
    public string? Error { get; set; }
    public JsonElement? Payload { get; set; }
}

public sealed class PipeEvent
{
    public string Event { get; set; } = string.Empty;
    public JsonElement? Payload { get; set; }
}

// ---- payloads ------------------------------------------------------------------------------

public sealed class HelloRequest { public string AppVersion { get; set; } = string.Empty; }

public sealed class HelloResponse
{
    public string AgentVersion { get; set; } = string.Empty;
    public string State { get; set; } = TrackingState.Stopped;
    public Guid? ShiftId { get; set; }
    public bool Anchored { get; set; }
    public int SessionId { get; set; }
}

public sealed class SetAnchorRequest { public DateTime ServerTime { get; set; } }

public sealed class StartTrackingRequest { public Guid ShiftId { get; set; } }

public sealed class PauseTrackingRequest { public string? Reason { get; set; } }

public sealed class PullSegmentsRequest { public int Max { get; set; } = 500; }

public sealed class PullSegmentsResponse
{
    public List<ActivitySegment> Segments { get; set; } = new();
    public int Remaining { get; set; }
}

public sealed class AckIdsRequest { public List<Guid> Ids { get; set; } = new(); }

public sealed class AckResponse { public int Deleted { get; set; } }

public sealed class PullTamperResponse { public List<TamperEvent> Events { get; set; } = new(); }

public sealed class StatusResponse
{
    public string State { get; set; } = TrackingState.Stopped;
    public Guid? ShiftId { get; set; }
    public bool Anchored { get; set; }
    public DateTime? AgentNow { get; set; }
    public int QueuedSegments { get; set; }
    public int QueuedTamper { get; set; }
    public long QueueBytes { get; set; }
    public double QueuePercent { get; set; }
    public bool ExtensionConnected { get; set; }
    public int SecondsSinceInput { get; set; }
    public string? ForegroundProcess { get; set; }
    public string? CurrentKind { get; set; }
    public long MemoryBytes { get; set; }
}

/// <summary>Message from the browser extension via the native host (09 section 5).</summary>
public sealed class ExtensionDomainMessage
{
    public string Domain { get; set; } = string.Empty;
    public string Browser { get; set; } = string.Empty;
    /// <summary>Unix milliseconds from the browser. Informational; the agent uses its own clock.</summary>
    public long Ts { get; set; }
}

public sealed class LongIdleEndedEvent { public DateTime From { get; set; } public DateTime To { get; set; } }

public sealed class QueueWarningEvent { public double Percent { get; set; } }

public sealed class StateChangedEvent { public string State { get; set; } = TrackingState.Stopped; public Guid? ShiftId { get; set; } }

/// <summary>Source generated JSON context: no reflection at runtime, camelCase to match the TypeScript side.</summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false)]
[JsonSerializable(typeof(PipeRequest))]
[JsonSerializable(typeof(PipeResponse))]
[JsonSerializable(typeof(PipeEvent))]
[JsonSerializable(typeof(HelloRequest))]
[JsonSerializable(typeof(HelloResponse))]
[JsonSerializable(typeof(SetAnchorRequest))]
[JsonSerializable(typeof(TrackingConfig))]
[JsonSerializable(typeof(StartTrackingRequest))]
[JsonSerializable(typeof(PauseTrackingRequest))]
[JsonSerializable(typeof(PullSegmentsRequest))]
[JsonSerializable(typeof(PullSegmentsResponse))]
[JsonSerializable(typeof(AckIdsRequest))]
[JsonSerializable(typeof(AckResponse))]
[JsonSerializable(typeof(PullTamperResponse))]
[JsonSerializable(typeof(StatusResponse))]
[JsonSerializable(typeof(ExtensionDomainMessage))]
[JsonSerializable(typeof(LongIdleEndedEvent))]
[JsonSerializable(typeof(QueueWarningEvent))]
[JsonSerializable(typeof(StateChangedEvent))]
[JsonSerializable(typeof(ActivitySegment))]
[JsonSerializable(typeof(TamperEvent))]
[JsonSerializable(typeof(PersistedTrackingState))]
[JsonSerializable(typeof(Dictionary<string, string>))]
public partial class PipeJsonContext : JsonSerializerContext
{
}

/// <summary>Helpers shared by agent, native host and tests.</summary>
public static class PipeJson
{
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, (System.Text.Json.Serialization.Metadata.JsonTypeInfo<T>)PipeJsonContext.Default.GetTypeInfo(typeof(T))!);

    public static T? Deserialize<T>(string json) => (T?)JsonSerializer.Deserialize(json, PipeJsonContext.Default.GetTypeInfo(typeof(T))!);

    public static T? Deserialize<T>(JsonElement element) => (T?)element.Deserialize(PipeJsonContext.Default.GetTypeInfo(typeof(T))!);

    public static JsonElement ToElement<T>(T value) => JsonSerializer.SerializeToElement(value, (System.Text.Json.Serialization.Metadata.JsonTypeInfo<T>)PipeJsonContext.Default.GetTypeInfo(typeof(T))!);

    public static PipeResponse Ok<T>(PipeRequest request, T payload) => new() { Command = request.Command, Id = request.Id, Ok = true, Payload = ToElement(payload) };

    public static PipeResponse Ok(PipeRequest request) => new() { Command = request.Command, Id = request.Id, Ok = true };

    public static PipeResponse Fail(PipeRequest request, string error) => new() { Command = request.Command, Id = request.Id, Ok = false, Error = error };

    public static PipeEvent Event<T>(string name, T payload) => new() { Event = name, Payload = ToElement(payload) };
}

/// <summary>Pipe naming (09 section 4): one pipe per interactive session.</summary>
public static class PipeNames
{
    public static string ForSession(int sessionId) => $"CompanyOS.Agent.{sessionId}";
}
