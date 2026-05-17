"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function LinkDonationContent() {
  const searchParams = useSearchParams();

  const [donorEmail, setDonorEmail] = useState(
    searchParams.get("email") || ""
  );

  const [receiptCode, setReceiptCode] = useState(
    searchParams.get("code") || ""
  );

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setIsLoading(true);

    const res = await fetch("/api/link-donation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ donorEmail, receiptCode }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to link donation.");
      setIsLoading(false);
      return;
    }

    setMessage("Guest donation linked successfully.");
    setDonorEmail("");
    setReceiptCode("");
    setIsLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">
          Link Guest Donation
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Enter the email used during guest donation and the guest donation
          linking code from your receipt.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">
              Donation Email
            </label>
            <input
              type="email"
              value={donorEmail}
              onChange={(e) => setDonorEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="guest@email.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Receipt Linking Code
            </label>
            <input
              type="text"
              value={receiptCode}
              onChange={(e) => setReceiptCode(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
              placeholder="RCPT-ABC123"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Linking..." : "Link Donation"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link
            href="/dashboard/donor"
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Donor Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LinkDonationPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading donation page...</div>}>
      <LinkDonationContent />
    </Suspense>
  );
}