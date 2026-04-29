import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { prisma } from "@/lib/prisma"

interface SendEmailRequestBody {
  to?: string[]
  subject?: string
  text?: string
  campaignId?: string
  campaignTitle?: string
  triggerKey?: string
  templateId?: string | null
  useConfiguredSenderAsRecipient?: boolean
}

const VALID_TRIGGER_KEYS = new Set([
  "manual_update",
  "thank_you",
  "milestone",
  "new_donation_alert",
])

function normaliseRecipients(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  return Array.from(
    new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

function extractEmailAddress(fromValue: string): string {
  const match = fromValue.match(/<([^>]+)>/)
  return match?.[1]?.trim() || fromValue.trim()
}

function buildTransport() {
  const host = process.env.EMAIL_SMTP_HOST
  const port = Number(process.env.EMAIL_SMTP_PORT || 587)
  const secure = parseBooleanEnv(process.env.EMAIL_SMTP_SECURE, port === 465)
  const user = process.env.EMAIL_SMTP_USER
  const pass = process.env.EMAIL_SMTP_PASS
  const requireTLS = parseBooleanEnv(process.env.EMAIL_SMTP_REQUIRE_TLS, !secure)

  if (!host) {
    throw new Error("Missing EMAIL_SMTP_HOST. Add it to your .env.local file.")
  }

  if (!user) {
    throw new Error("Missing EMAIL_SMTP_USER. Add it to your .env.local file.")
  }

  if (!pass) {
    throw new Error("Missing EMAIL_SMTP_PASS. Add it to your .env.local file.")
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: {
      user,
      pass,
    },
  })
}

function normaliseTriggerKey(value?: string): string | null {
  if (!value) return null
  return VALID_TRIGGER_KEYS.has(value) ? value : null
}

function mapTriggerKeyToTriggerTypes(triggerKey: string | null): string[] {
  switch (triggerKey) {
    case "manual_update":
      return ["campaign_update", "manual_update"]
    case "thank_you":
      return ["donation_received", "thank_you"]
    case "milestone":
      return ["milestone_50", "milestone"]
    case "new_donation_alert":
      return ["new_donation_alert", "donation_alert"]
    default:
      return []
  }
}

async function resolveTemplateId(
  explicitTemplateId: string | null | undefined,
  triggerKey: string | null
): Promise<string | null> {
  if (explicitTemplateId) return explicitTemplateId

  const triggerTypes = mapTriggerKeyToTriggerTypes(triggerKey)
  if (triggerTypes.length === 0) return null

  const rule = await prisma.emailAutomationRule.findFirst({
    where: {
      triggerType: {
        in: triggerTypes,
      },
    },
    select: {
      id: true,
    },
  })

  return rule?.id ?? null
}

async function persistLogs(payload: {
  recipients: string[]
  subject: string
  body: string
  status: "sent" | "failed"
  campaignId?: string
  templateId?: string | null
}) {
  if (payload.recipients.length === 0) return

  await prisma.emailLog.createMany({
    data: payload.recipients.map((recipientEmail) => ({
      recipientEmail,
      subject: payload.subject,
      body: payload.body,
      status: payload.status,
      campaignId: payload.campaignId || null,
      templateId: payload.templateId || null,
      sentAt: new Date(),
    })),
  })
}

export async function POST(request: Request) {
  const from = process.env.EMAIL_FROM

  if (!from) {
    return NextResponse.json(
      { error: "Missing EMAIL_FROM. Add it to your .env.local file." },
      { status: 500 }
    )
  }

  let body: SendEmailRequestBody

  try {
    body = (await request.json()) as SendEmailRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 })
  }

  const configuredSmtpUser = process.env.EMAIL_SMTP_USER?.trim()
  const recipients = body.useConfiguredSenderAsRecipient
    ? configuredSmtpUser
      ? [configuredSmtpUser]
      : []
    : normaliseRecipients(body.to)

  const subject = body.subject?.trim()
  const text = body.text?.trim()
  const triggerKey = normaliseTriggerKey(body.triggerKey)

  if (recipients.length <= 0) {
    return NextResponse.json(
      {
        error: body.useConfiguredSenderAsRecipient
          ? "Missing EMAIL_SMTP_USER. Add it to your .env.local file."
          : "At least one recipient email is required.",
      },
      { status: 400 }
    )
  }

  if (!subject) {
    return NextResponse.json({ error: "Email subject is required." }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: "Email body is required." }, { status: 400 })
  }

  const templateId = await resolveTemplateId(body.templateId, triggerKey)

  try {
    const transporter = buildTransport()

    const html = text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
      .join("")

    const fromAddress = extractEmailAddress(from)
    const singleRecipient = recipients.length === 1

    const info = await transporter.sendMail({
      from,
      to: singleRecipient ? recipients[0] : fromAddress,
      bcc: singleRecipient ? undefined : recipients,
      subject,
      text,
      html,
      headers: {
        ...(body.campaignId ? { "X-Campaign-Id": body.campaignId } : {}),
        ...(body.campaignTitle ? { "X-Campaign-Title": body.campaignTitle } : {}),
        ...(triggerKey ? { "X-Trigger-Key": triggerKey } : {}),
      },
    })

    let logPersistenceError: string | null = null

    try {
      await persistLogs({
        recipients,
        subject,
        body: text,
        status: "sent",
        campaignId: body.campaignId,
        templateId,
      })
    } catch (error) {
      console.error("Failed to persist sent email logs:", error)
      logPersistenceError =
        error instanceof Error ? error.message : "Unable to persist sent email logs."
    }

    return NextResponse.json({
      ok: true,
      deliveredCount: recipients.length,
      resolvedRecipients: recipients,
      messageId: info.messageId,
      envelope: info.envelope,
      templateId,
      ...(logPersistenceError ? { logPersistenceError } : {}),
    })
  } catch (error) {
    let logPersistenceError: string | null = null

    try {
      await persistLogs({
        recipients,
        subject,
        body: text,
        status: "failed",
        campaignId: body.campaignId,
        templateId,
      })
    } catch (logError) {
      console.error("Failed to persist failed email logs:", logError)
      logPersistenceError =
        logError instanceof Error ? logError.message : "Unable to persist failed email logs."
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send the email right now.",
        templateId,
        ...(logPersistenceError ? { logPersistenceError } : {}),
      },
      { status: 500 }
    )
  }
}