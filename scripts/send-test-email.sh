#!/usr/bin/env bash
# Sends a simulated SendGrid Inbound Parse request to the news webhook.
#
# Usage: scripts/send-test-email.sh [email-file] [webhook-url]
#   email-file   defaults to test-email.txt in the project root (see test-email.example.txt)
#   webhook-url  defaults to http://localhost:3000/api/webhook/news
#
# The dev server must run with SENDGRID_SKIP_SIGNATURE=true (in .env.development.local), since
# this script doesn't sign the request. The From address must be in SENDGRID_ALLOWED_SENDERS.
#
# Email file format: header lines, a blank line, then the plain-text body.
#   From: "ACME Oyj" <ir@acme.fi>
#   To: news@parse.stolysis.fi
#   Cc: someone@example.com
#   Subject: ACME Oyj: Interim report Q3
#   Date: Sat, 7 Nov 2026 09:00:00 +0200   (sent in SendGrid's raw `headers` field)
#   Attachment: ./test-files/report.pdf   (repeatable, relative to the email file)
# Header lines starting with # are ignored.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
email_file="${1:-$project_root/test-email.txt}"
url="${2:-http://localhost:3000/api/webhook/news}"

if [[ ! -f "$email_file" ]]; then
  echo "Email file not found: $email_file" >&2
  echo "Copy test-email.example.txt to test-email.txt to get started." >&2
  exit 1
fi
email_dir="$(cd "$(dirname "$email_file")" && pwd)"

form=()
attachments=0
raw_headers=""
in_headers=true
body=""

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  if $in_headers; then
    if [[ -z "$line" ]]; then
      in_headers=false
      continue
    fi
    [[ "$line" == \#* ]] && continue
    if [[ "$line" != *:* ]]; then
      echo "Invalid header line (expected 'Name: value'): $line" >&2
      exit 1
    fi
    name="$(tr '[:upper:]' '[:lower:]' <<<"${line%%:*}")"
    value="${line#*:}"
    value="${value#"${value%%[![:space:]]*}"}"
    case "$name" in
      from | to | cc | subject)
        form+=(--form-string "$name=$value")
        ;;
      date)
        raw_headers+="Date: $value"$'\n'
        ;;
      attachment)
        [[ "$value" == /* ]] || value="$email_dir/$value"
        if [[ ! -f "$value" ]]; then
          echo "Attachment not found: $value" >&2
          exit 1
        fi
        attachments=$((attachments + 1))
        form+=(-F "attachment$attachments=@$value")
        ;;
      *)
        echo "Unknown header '$name', skipping" >&2
        ;;
    esac
  else
    body+="$line"$'\n'
  fi
done <"$email_file"

form+=(--form-string "text=$body" --form-string "attachments=$attachments")
[[ -n "$raw_headers" ]] && form+=(--form-string "headers=$raw_headers")

echo "POST $url"
status="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$url" "${form[@]}")"
echo "HTTP $status"
[[ "$status" == 2* ]]
