"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HandHeart, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/components/providers/session-provider"

const PRESET_AMOUNTS = [10, 25, 50, 100, 250]

export default function DonatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [amount, setAmount] = useState("")
  const [customAmount, setCustomAmount] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [campaignLocked, setCampaignLocked] = useState(false)
  const [campaignTitle, setCampaignTitle] = useState("")
  const [statusLoading, setStatusLoading] = useState(true)

  // Check campaign lock status
  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === "locked") setCampaignLocked(true)
        if (data.title) setCampaignTitle(data.title)
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false))
  }, [id])

  // Pre-fill from session
  useEffect(() => {
    if (user) {
      setName(`${user.firstName} ${user.lastName}`)
      setEmail(user.email)
    }
  }, [user])

  const selectedAmount = amount || customAmount

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    const numAmount = Number(selectedAmount)
    if (!numAmount || numAmount <= 0) {
      setError("Please select or enter a donation amount.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: id,
          amount: numAmount,
          donorName: name,
          donorEmail: email,
          message,
          isAnonymous,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push(`/receipt/${data.donationId}`)
      } else {
        setError(data.error || "Donation failed. Please try again.")
      }
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (statusLoading) {
    return (
      <main className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (campaignLocked) {
    return (
      <main className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-12">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Campaign Locked</CardTitle>
            <CardDescription>
              {campaignTitle ? `"${campaignTitle}" is` : "This campaign is"} no longer accepting donations.
              It has been flagged and locked by an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <button
              onClick={() => router.back()}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Go back
            </button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-12">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <HandHeart className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Make a Donation</CardTitle>
          <CardDescription>Your generosity makes a real difference.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Preset amounts */}
            <div className="space-y-2">
              <Label>Donation Amount</Label>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_AMOUNTS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setAmount(String(preset)); setCustomAmount("") }}
                    className={`rounded-lg border py-2 text-sm font-semibold transition-colors ${
                      amount === String(preset)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Custom amount"
                value={customAmount}
                min={1}
                onChange={e => { setCustomAmount(e.target.value); setAmount("") }}
                className="mt-1"
              />
            </div>

            {/* Anonymous toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="anonymous"
                checked={isAnonymous}
                onCheckedChange={v => setIsAnonymous(Boolean(v))}
              />
              <Label htmlFor="anonymous" className="font-normal cursor-pointer">
                Donate anonymously
              </Label>
            </div>

            {/* Name & email — hidden when anonymous */}
            {!isAnonymous && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="donor-name">Your Name</Label>
                  <Input
                    id="donor-name"
                    placeholder="Full name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={!!user && !authLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="donor-email">Email</Label>
                  <Input
                    id="donor-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={!!user && !authLoading}
                  />
                  {user && (
                    <p className="text-xs text-muted-foreground">
                      Using your account email. Receipt will be linked to your profile.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Optional message */}
            <div className="space-y-1.5">
              <Label htmlFor="donor-message">Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="donor-message"
                placeholder="Leave a note of encouragement…"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><HandHeart className="mr-2 h-4 w-4" /> Donate {selectedAmount ? `$${Number(selectedAmount).toLocaleString()}` : "Now"}</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
