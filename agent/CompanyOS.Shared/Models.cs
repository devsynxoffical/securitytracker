using System;

namespace CompanyOS.Shared
{
    public enum SegmentKind
    {
        Active,
        Idle,
        Locked
    }

    public enum ActivityExceptionType
    {
        None,
        CallApp,
        MeetingApp,
        Mic
    }

    public class ActivitySegmentModel
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ShiftId { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime EndedAt { get; set; }
        public SegmentKind Kind { get; set; } = SegmentKind.Active;
        public string ProcessName { get; set; } = string.Empty;
        public string AppName { get; set; } = string.Empty;
        public string? Domain { get; set; }
        public string? WindowTitle { get; set; }
        public int KeyCount { get; set; }
        public int MouseCount { get; set; }
        public ActivityExceptionType Exception { get; set; } = ActivityExceptionType.None;
        public string ClockSource { get; set; } = "anchored";
    }

    public class PipeMessage<T>
    {
        public string Command { get; set; } = string.Empty;
        public T? Payload { get; set; }
    }

    public class TrackingConfigPayload
    {
        public int IdleThresholdSeconds { get; set; } = 300;
        public bool CaptureWindowTitles { get; set; } = false;
        public string[] ExceptionApps { get; set; } = Array.Empty<string>();
        public string[] Exclusions { get; set; } = Array.Empty<string>();
    }
}
