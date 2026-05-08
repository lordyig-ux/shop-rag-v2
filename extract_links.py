"""
Phase 2: Link Extraction — Extract all procedure URLs from the ICBC MDP nav XML.

Uses Approach A: Direct API call to fetch the navigation XML, parse the DITA map
structure, and extract all topic IDs with titles and category hierarchy.
"""

import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import requests

NAV_XML_URL = "https://mdp.partners.icbc.com/maps/nav_DAMG-MP-NRP91J-vendors.xml"
BASE_TOPIC_URL = "https://mdp.partners.icbc.com/topic"
MAP_NAME = "DAMG-MP-NRP91J-vendors"
OUTPUT_DIR = Path("output")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(OUTPUT_DIR / "extraction_log.txt", mode="w"),
    ],
)
log = logging.getLogger(__name__)


def fetch_nav_xml() -> str:
    """Fetch the navigation XML from the ICBC site."""
    log.info(f"Fetching nav XML from {NAV_XML_URL}")
    resp = requests.get(NAV_XML_URL, timeout=30)
    resp.raise_for_status()
    log.info(f"Received {len(resp.text):,} bytes")
    return resp.text


def parse_topicrefs(element, category_path=None):
    """
    Recursively parse topicref elements from the DITA map XML.
    Builds a flat list of all topics with their hierarchy path.
    """
    if category_path is None:
        category_path = []

    results = []

    for topicref in element.findall("topicref"):
        href = topicref.get("href", "")
        navtitle = topicref.get("navtitle", "")

        if not href:
            continue

        # Build the full URL for this topic
        topic_url = f"{BASE_TOPIC_URL}/{href}?map={MAP_NAME}"

        entry = {
            "id": href,
            "title": navtitle,
            "url": topic_url,
            "category": " > ".join(category_path) if category_path else "",
            "content_url": f"https://mdp.partners.icbc.com/topics/{href}.html",
        }
        results.append(entry)

        # Recurse into children with this topic as part of the category path
        child_path = category_path + [navtitle] if navtitle else category_path
        children = parse_topicrefs(topicref, child_path)
        results.extend(children)

    return results


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Fetch and parse the nav XML
    xml_text = fetch_nav_xml()

    # Save raw XML for reference
    with open(OUTPUT_DIR / "nav_raw.xml", "w", encoding="utf-8") as f:
        f.write(xml_text)

    root = ET.fromstring(xml_text)

    # Extract title
    title_el = root.find("title")
    map_title = title_el.text if title_el is not None else "Unknown"
    log.info(f"Map title: {map_title}")

    # Parse all topic references
    all_topics = parse_topicrefs(root)
    log.info(f"Extracted {len(all_topics)} topic references")

    # Deduplicate by ID
    seen = set()
    unique_topics = []
    duplicates = 0
    for topic in all_topics:
        if topic["id"] not in seen:
            seen.add(topic["id"])
            unique_topics.append(topic)
        else:
            duplicates += 1

    log.info(f"Unique topics: {len(unique_topics)} (removed {duplicates} duplicates)")

    # Save to all_links.json
    output_path = OUTPUT_DIR / "all_links.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(unique_topics, f, indent=2, ensure_ascii=False)
    log.info(f"Saved to {output_path}")

    # Print category summary
    categories = {}
    for topic in unique_topics:
        cat = topic["category"].split(" > ")[0] if topic["category"] else "(top-level)"
        categories[cat] = categories.get(cat, 0) + 1

    log.info("Category breakdown:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        log.info(f"  {cat}: {count} topics")

    # Verify a sample topic URL is accessible
    sample = unique_topics[0]
    log.info(f"Verifying sample topic: {sample['content_url']}")
    try:
        resp = requests.get(sample["content_url"], timeout=15)
        log.info(f"  Status: {resp.status_code}, Size: {len(resp.text):,} bytes")
    except Exception as e:
        log.warning(f"  Failed to verify: {e}")

    print(f"\nDone! {len(unique_topics)} procedure links saved to {output_path}")


if __name__ == "__main__":
    main()
