using CompanyOS.Core.Tracking;
using CompanyOS.Shared.Models;
using CompanyOS.Shared.Protocol;

namespace CompanyOS.Core.Pipe;

/// <summary>
/// Maps pipe commands (09 section 4) to the engine. Pure: takes a request, returns a response. The pipe
/// server does the I/O. Unknown commands and malformed payloads return ok=false, never throw.
/// </summary>
public sealed class CommandHandler
{
    private readonly TrackingEngine _engine;
    private readonly int _sessionId;
    private readonly string _agentVersion;

    public CommandHandler(TrackingEngine engine, int sessionId, string agentVersion)
    {
        _engine = engine;
        _sessionId = sessionId;
        _agentVersion = agentVersion;
    }

    public PipeResponse Handle(string line)
    {
        PipeRequest? req;
        try { req = PipeJson.Deserialize<PipeRequest>(line); }
        catch (Exception ex) { return new PipeResponse { Ok = false, Error = "invalid_json: " + ex.Message }; }
        if (req is null || string.IsNullOrWhiteSpace(req.Command)) return new PipeResponse { Ok = false, Error = "missing_command" };
        return Handle(req);
    }

    public PipeResponse Handle(PipeRequest req)
    {
        try
        {
            switch (req.Command)
            {
                case Commands.Hello:
                    return PipeJson.Ok(req, _engine.Hello(_sessionId, _agentVersion));

                case Commands.SetAnchor:
                {
                    var p = Payload<SetAnchorRequest>(req);
                    if (p is null || p.ServerTime == default) return PipeJson.Fail(req, "serverTime required");
                    _engine.SetAnchor(p.ServerTime);
                    return PipeJson.Ok(req);
                }
                case Commands.SetConfig:
                {
                    var p = Payload<TrackingConfig>(req);
                    if (p is null) return PipeJson.Fail(req, "config required");
                    if (p.IdleThresholdSeconds < 30) return PipeJson.Fail(req, "idleThresholdSeconds must be >= 30");
                    if (p.SegmentMaxSeconds is < 60 or > 900) return PipeJson.Fail(req, "segmentMaxSeconds must be 60..900");
                    _engine.SetConfig(p);
                    return PipeJson.Ok(req);
                }
                case Commands.StartTracking:
                {
                    var p = Payload<StartTrackingRequest>(req);
                    if (p is null || p.ShiftId == Guid.Empty) return PipeJson.Fail(req, "shiftId required");
                    _engine.StartTracking(p.ShiftId);
                    return PipeJson.Ok(req);
                }
                case Commands.PauseTracking:
                    _engine.PauseTracking(Payload<PauseTrackingRequest>(req)?.Reason);
                    return PipeJson.Ok(req);

                case Commands.ResumeTracking:
                    _engine.ResumeTracking();
                    return PipeJson.Ok(req);

                case Commands.StopTracking:
                    _engine.StopTracking();
                    return PipeJson.Ok(req);

                case Commands.PullSegments:
                    return PipeJson.Ok(req, _engine.PullSegments(Payload<PullSegmentsRequest>(req)?.Max ?? 500));

                case Commands.AckSegments:
                {
                    var p = Payload<AckIdsRequest>(req);
                    return PipeJson.Ok(req, new AckResponse { Deleted = _engine.AckSegments(p?.Ids ?? new List<Guid>()) });
                }
                case Commands.PullTamper:
                    return PipeJson.Ok(req, _engine.PullTamper(Payload<PullSegmentsRequest>(req)?.Max ?? 100));

                case Commands.AckTamper:
                {
                    var p = Payload<AckIdsRequest>(req);
                    return PipeJson.Ok(req, new AckResponse { Deleted = _engine.AckTamper(p?.Ids ?? new List<Guid>()) });
                }
                case Commands.Status:
                    return PipeJson.Ok(req, _engine.Status());

                case Commands.ExtensionDomain:
                {
                    var p = Payload<ExtensionDomainMessage>(req);
                    if (p is null || string.IsNullOrWhiteSpace(p.Browser)) return PipeJson.Fail(req, "browser required");
                    _engine.OnExtensionDomain(p);
                    return PipeJson.Ok(req);
                }
                default:
                    return PipeJson.Fail(req, "unknown_command");
            }
        }
        catch (Exception ex)
        {
            return PipeJson.Fail(req, "internal: " + ex.GetType().Name);
        }
    }

    private static T? Payload<T>(PipeRequest req) where T : class
        => req.Payload is { } el && el.ValueKind == System.Text.Json.JsonValueKind.Object ? PipeJson.Deserialize<T>(el) : null;
}
