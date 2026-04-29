import type { EmailTriggerKey } from "@/app/entity/EmailAutomationRule"

export type EmailSendStatus = "sent" | "queued" | "failed"
export type EmailRecipientType = "donor" | "fund_raiser"

export interface EmailLogProps {
  id: string
  ruleKey: EmailTriggerKey
  recipientType: EmailRecipientType
  recipientName: string
  recipientEmail?: string
  subject: string
  status: EmailSendStatus
  sentAt: string
  campaignId?: string
  campaignTitle?: string
}

export interface EmailLogSummary {
  id: string
  ruleKey: EmailTriggerKey
  recipientType: EmailRecipientType
  recipientName: string
  recipientEmail?: string
  subject: string
  status: EmailSendStatus
  sentAt: string
  campaignId?: string
  campaignTitle?: string
  ruleLabel: string
  statusLabel: string
}

const RULE_LABELS: Record<EmailTriggerKey, string> = {
  thank_you: "Thank-you email",
  milestone: "Milestone email",
  new_donation_alert: "New donation alert",
  manual_update: "Manual campaign update",
}

export class EmailLog {
  private readonly id: string
  private readonly ruleKey: EmailTriggerKey
  private readonly recipientType: EmailRecipientType
  private readonly recipientName: string
  private readonly recipientEmail?: string
  private readonly subject: string
  private readonly status: EmailSendStatus
  private readonly sentAt: string
  private readonly campaignId?: string
  private readonly campaignTitle?: string

  constructor(props: EmailLogProps) {
    this.id = props.id
    this.ruleKey = props.ruleKey
    this.recipientType = props.recipientType
    this.recipientName = props.recipientName
    this.recipientEmail = props.recipientEmail
    this.subject = props.subject
    this.status = props.status
    this.sentAt = props.sentAt
    this.campaignId = props.campaignId
    this.campaignTitle = props.campaignTitle
  }

  isSuccessful(): boolean {
    return this.status === "sent"
  }

  isRecent(referenceTimestamp: number, lookbackDays = 7): boolean {
    const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000
    return referenceTimestamp - new Date(this.sentAt).getTime() <= lookbackMs
  }

  getStatusLabel(): string {
    switch (this.status) {
      case "queued":
        return "Queued"
      case "failed":
        return "Failed"
      case "sent":
      default:
        return "Sent"
    }
  }

  toSummary(): EmailLogSummary {
    return {
      id: this.id,
      ruleKey: this.ruleKey,
      recipientType: this.recipientType,
      recipientName: this.recipientName,
      recipientEmail: this.recipientEmail,
      subject: this.subject,
      status: this.status,
      sentAt: this.sentAt,
      campaignId: this.campaignId,
      campaignTitle: this.campaignTitle,
      ruleLabel: RULE_LABELS[this.ruleKey],
      statusLabel: this.getStatusLabel(),
    }
  }
}
