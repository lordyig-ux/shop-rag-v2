"""
Phase 3: Content Scraping — Download full text content of every repair procedure.

Reads all_links.json, fetches each topic's HTML content, converts to markdown,
and saves as individual .md files with YAML frontmatter.
"""

import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md

OUTPUT_DIR = Path("output")
PROCEDURES_DIR = OUTPUT_DIR / "procedures"
LINKS_FILE = OUTPUT_DIR / "all_links.json"
PROGRESS_FILE = OUTPUT_DIR / "scrape_progress.json"
ERRORS_LOG = OUTPUT_DIR / "scrape_errors.log"

REQUEST_DELAY = 1.0  # seconds between requests
MAX_RETRIES = 3
BACKOFF_FACTOR = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger(__name__)


def load_progress():
    """Load scrape progress to allow resuming."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"completed": [], "failed": []}


def save_progress(progress):
    """Save scrape progress."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def log_error(topic_id, url, error_msg):
    """Append error to the errors log."""
    with open(ERRORS_LOG, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat()} | {topic_id} | {url} | {error_msg}\n")


def extract_content(html_text, topic):
    """
    Parse the XHTML topic content, extract the main body,
    and convert to markdown with YAML frontmatter.
    """
    soup = BeautifulSoup(html_text, "html.parser")

    # Extract metadata from <meta> tags
    meta = {}
    for tag in soup.find_all("meta"):
        name = tag.get("name", "")
        content = tag.get("content", "")
        if name and content:
            meta[name] = content

    title = meta.get("DC.title", topic.get("title", ""))
    description = meta.get("description", "")
    date_modified = meta.get("DC.Date.Modified", "")

    # Extract the main body content
    body = soup.find("body")
    if not body:
        return None

    # Remove any script/style tags
    for tag in body.find_all(["script", "style"]):
        tag.decompose()

    # Convert body HTML to markdown
    body_html = str(body)
    markdown_content = md(body_html, heading_style="ATX", strip=["img"])

    # Clean up the markdown
    markdown_content = re.sub(r"\n{3,}", "\n\n", markdown_content)  # reduce blank lines
    markdown_content = markdown_content.strip()

    # Build the full document with frontmatter
    escaped_title = title.replace('"', '\\"')
    escaped_desc = description.replace('"', '\\"')
    topic_url = topic['url']
    topic_content_url = topic['content_url']
    topic_category = topic.get('category', '')
    now_iso = datetime.now().isoformat()
    frontmatter = f"""---
title: "{escaped_title}"
url: "{topic_url}"
content_url: "{topic_content_url}"
category: "{topic_category}"
description: "{escaped_desc}"
date_modified: "{date_modified}"
scraped_at: "{now_iso}"
---

"""
    return frontmatter + markdown_content


def fetch_with_retry(url, max_retries=MAX_RETRIES):
    """Fetch URL with exponential backoff on failure."""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                return resp
            elif resp.status_code in (429, 500, 502, 503, 504):
                wait = BACKOFF_FACTOR ** attempt * REQUEST_DELAY
                log.warning(f"  Status {resp.status_code}, retrying in {wait:.0f}s...")
                time.sleep(wait)
            else:
                log.warning(f"  Status {resp.status_code}")
                return resp
        except requests.RequestException as e:
            wait = BACKOFF_FACTOR ** attempt * REQUEST_DELAY
            log.warning(f"  Request error: {e}, retrying in {wait:.0f}s...")
            time.sleep(wait)
    return None


def main():
    PROCEDURES_DIR.mkdir(parents=True, exist_ok=True)

    # Load links
    with open(LINKS_FILE, "r") as f:
        topics = json.load(f)
    log.info(f"Loaded {len(topics)} topics from {LINKS_FILE}")

    # Load progress
    progress = load_progress()
    completed_ids = set(progress["completed"])
    remaining = [t for t in topics if t["id"] not in completed_ids]
    log.info(f"Already completed: {len(completed_ids)}, remaining: {len(remaining)}")

    success_count = len(completed_ids)
    fail_count = len(progress["failed"])

    for i, topic in enumerate(remaining):
        topic_id = topic["id"]
        content_url = topic["content_url"]

        log.info(f"[{success_count + fail_count + 1}/{len(topics)}] {topic_id}")

        resp = fetch_with_retry(content_url)

        if resp is None or resp.status_code != 200:
            status = resp.status_code if resp else "timeout"
            log.error(f"  FAILED: {status}")
            log_error(topic_id, content_url, f"status={status}")
            progress["failed"].append(topic_id)
            fail_count += 1
            save_progress(progress)
            time.sleep(REQUEST_DELAY)
            continue

        # Extract and save content
        markdown = extract_content(resp.text, topic)
        if markdown is None:
            log.error(f"  FAILED: no body content found")
            log_error(topic_id, content_url, "no body content")
            progress["failed"].append(topic_id)
            fail_count += 1
        else:
            # Sanitize filename
            safe_id = re.sub(r'[<>:"/\\|?*]', "_", topic_id)
            filepath = PROCEDURES_DIR / f"{safe_id}.md"
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(markdown)

            progress["completed"].append(topic_id)
            completed_ids.add(topic_id)
            success_count += 1
            log.info(f"  OK ({len(resp.text):,} bytes -> {len(markdown):,} chars)")

        save_progress(progress)

        # Rate limit
        time.sleep(REQUEST_DELAY)

    # Summary
    print(f"\n{'='*60}")
    print(f"SCRAPING COMPLETE")
    print(f"{'='*60}")
    print(f"Total topics:   {len(topics)}")
    print(f"Successful:     {success_count}")
    print(f"Failed:         {fail_count}")
    print(f"Output:         {PROCEDURES_DIR}/")


if __name__ == "__main__":
    main()
