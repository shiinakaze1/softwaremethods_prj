export type EmailTriggerKey =
  | "thank_you"
  | "milestone"
  | "new_donation_alert"
  | "manual_update"

export type EmailAudience = "donor" | "fund_raiser"

export interface EmailAutomationRuleProps {
  id: string
  key: EmailTriggerKey
  label: string
  description: string
  audience: EmailAudience
  isEnabled: boolean
}

export interface EmailAutomationRuleSummary {
  id: string
  key: EmailTriggerKey
  label: string
  description: string
  audience: EmailAudience
  isEnabled: boolean
}

export class EmailAutomationRule {
  private readonly id: string
  private readonly key: EmailTriggerKey
  private readonly label: string
  private readonly description: string
  private readonly audience: EmailAudience
  private isEnabled: boolean

  constructor(props: EmailAutomationRuleProps) {
    this.id = props.id
    this.key = props.key
    this.label = props.label
    this.description = props.description
    this.audience = props.audience
    this.isEnabled = props.isEnabled
  }

  getId(): string {
    return this.id
  }

  getKey(): EmailTriggerKey {
    return this.key
  }

  getLabel(): string {
    return this.label
  }

  getDescription(): string {
    return this.description
  }

  getAudience(): EmailAudience {
    return this.audience
  }

  isActive(): boolean {
    return this.isEnabled
  }

  isDonorRule(): boolean {
    return this.audience === "donor"
  }

  isFundRaiserRule(): boolean {
    return this.audience === "fund_raiser"
  }

  toggle(): void {
    this.isEnabled = !this.isEnabled
  }

  enable(): void {
    this.isEnabled = true
  }

  disable(): void {
    this.isEnabled = false
  }

  toSummary(): EmailAutomationRuleSummary {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
      description: this.description,
      audience: this.audience,
      isEnabled: this.isEnabled,
    }
  }
}
