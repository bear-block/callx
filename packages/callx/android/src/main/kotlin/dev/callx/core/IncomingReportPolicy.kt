package dev.callx.core

/** What the platform layer does with an invitation after the coordinator decided its outcome. */
sealed interface IncomingReportDecision {
    /** Report the call and let it ring. */
    data object Ring : IncomingReportDecision
    /** iOS must report this push: report the live call's ID again and do not end it. */
    data object ReportExisting : IncomingReportDecision
    /** iOS must report this push: report it under a fresh ID and end it immediately with this reason. */
    data class ReportEnded(val reason: String) : IncomingReportDecision
    /** Nothing is shown. */
    data object Skip : IncomingReportDecision
}

object IncomingReportPolicy {
    /** [outcome] is null when the payload could not be decoded. Android never has to report. */
    fun decide(outcome: IncomingOutcome?, mustReport: Boolean): IncomingReportDecision = when (outcome) {
        null -> if (mustReport) IncomingReportDecision.ReportEnded("failed") else IncomingReportDecision.Skip
        IncomingOutcome.Accepted -> IncomingReportDecision.Ring
        IncomingOutcome.Duplicate -> if (mustReport) IncomingReportDecision.ReportExisting else IncomingReportDecision.Skip
        is IncomingOutcome.Ended -> if (mustReport) IncomingReportDecision.ReportEnded(outcome.reason) else IncomingReportDecision.Skip
        IncomingOutcome.Busy -> if (mustReport) IncomingReportDecision.ReportEnded("busy") else IncomingReportDecision.Skip
        IncomingOutcome.Expired -> if (mustReport) IncomingReportDecision.ReportEnded("unanswered") else IncomingReportDecision.Skip
    }

    /** The tombstone recorded for a rejected invitation so a repeat push cannot ring later. */
    fun tombstoneReason(outcome: IncomingOutcome): String? = when (outcome) {
        IncomingOutcome.Busy -> "busy"
        IncomingOutcome.Expired -> "unanswered"
        else -> null
    }
}
