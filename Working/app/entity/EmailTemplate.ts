import type { EmailTriggerKey } from "@/app/entity/EmailAutomationRule"

export interface EmailTemplateProps {
  id: string
  ruleKey: EmailTriggerKey
  label: string
  description: string
  subjectTemplate: string
  bodyTemplate: string
  updatedAt?: string
}

export interface EmailTemplateSummary {
  id: string
  ruleKey: EmailTriggerKey
  label: string
  description: string
  subjectTemplate: string
  bodyTemplate: string
  updatedAt?: string
}

export interface EmailTemplateUpdateInput {
  subjectTemplate?: string
  bodyTemplate?: string
}

export class EmailTemplate {
  private readonly defaults: EmailTemplateProps
  private readonly props: EmailTemplateProps

  constructor(props: EmailTemplateProps) {
    this.props = { ...props }
    this.defaults = { ...props }
  }

  getRuleKey(): EmailTriggerKey {
    return this.props.ruleKey
  }

  getLabel(): string {
    return this.props.label
  }

  update(input: EmailTemplateUpdateInput): void {
    this.props.subjectTemplate = input.subjectTemplate ?? this.props.subjectTemplate
    this.props.bodyTemplate = input.bodyTemplate ?? this.props.bodyTemplate
    this.props.updatedAt = new Date().toISOString()
  }

  reset(): void {
    this.props.subjectTemplate = this.defaults.subjectTemplate
    this.props.bodyTemplate = this.defaults.bodyTemplate
    this.props.updatedAt = new Date().toISOString()
  }

  renderSubject(replacements: Record<string, string | number | undefined>): string {
    return renderTemplate(this.props.subjectTemplate, replacements)
  }

  renderBody(replacements: Record<string, string | number | undefined>): string {
    return renderTemplate(this.props.bodyTemplate, replacements)
  }

  toSummary(): EmailTemplateSummary {
    return { ...this.props }
  }
}

export function createDefaultEmailTemplates(): EmailTemplateSummary[] {
  return [
    {
      id: "template-campaign-update",
      ruleKey: "manual_update",
      label: "Campaign update",
      description: "Automatic campaign update email template for supporter updates.",
      subjectTemplate: "Campaign update: {{campaignTitle}}",
      bodyTemplate:
        "Hi there,\n\nWe wanted to share a quick update on {{campaignTitle}}. The campaign has currently raised {{raisedAmount}} out of {{targetAmount}}, and every show of support continues to move us closer to the goal.\n\nThank you for staying involved and for helping us keep this momentum going.",
    },
    {
      id: "template-thank-you",
      ruleKey: "thank_you",
      label: "Thank you",
      description: "Automatic post-donation thank-you email template.",
      subjectTemplate: "Thank you for supporting {{campaignTitle}}",
      bodyTemplate:
        "Hi there,\n\nThank you for your support of {{campaignTitle}}. Your contribution helps us move closer to our goal of {{targetAmount}}, and we truly appreciate your generosity.\n\nWe are grateful to have you with us on this campaign.",
    },
    {
      id: "template-milestone",
      ruleKey: "milestone",
      label: "Milestone update",
      description: "Automatic campaign milestone announcement template.",
      subjectTemplate: "We have reached {{milestonePercent}}% of our goal for {{campaignTitle}}",
      bodyTemplate:
        "Hi there,\n\nWe are excited to share that {{campaignTitle}} has now reached {{milestonePercent}}% of its target. This progress would not be possible without the support of our community.\n\nThank you for helping us get this far. We hope you will continue sharing and supporting the campaign as we work toward the next milestone.",
    },
    {
      id: "template-new-donation-alert",
      ruleKey: "new_donation_alert",
      label: "New donation alert",
      description: "Automatic new donation alert sent to the fund raiser.",
      subjectTemplate: "New donation received for {{campaignTitle}}",
      bodyTemplate:
        "Hello {{fundRaiserName}},\n\nA new donation has just been received for {{campaignTitle}}. The campaign has currently raised {{raisedAmount}} out of {{targetAmount}}, with support from {{donorCount}} supporters so far.\n\nLog in to FundBridge to view the latest campaign activity and keep the momentum going.",
    },
  ]
}

function renderTemplate(template: string, replacements: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = replacements[key]
    return value === undefined || value === null ? "" : String(value)
  })
}
