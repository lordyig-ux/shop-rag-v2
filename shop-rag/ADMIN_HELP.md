# Shop Knowledge Base Admin Help

This guide is for shop admins who need to update ICBC information or add shop documents to the knowledge base.

You do not need to know programming to use these tools.

## Open The Admin Page

1. Open the dashboard in a browser.
2. Go to:

```text
http://127.0.0.1:8000/admin
```

If you are using another computer on the shop network, use the server computer IP address instead, for example:

```text
http://192.168.1.50:8000/admin
```

3. Log in with the admin username and password.

The admin page has a section called:

```text
Knowledge Base Tools
```

That is where ICBC updates and shop document imports are run.

## Important Safety Notes

- Staff can keep using the normal search page while admin tools run.
- Only one admin job can run at a time.
- If an update fails, the old working knowledge base stays in place.
- Do not close the server or stop Docker/Qdrant while an import is running.
- Do not put private customer files into the shop-doc inbox unless you want them searchable.

## Updating The ICBC Data

ICBC procedures can change over time. A good routine is to check once a month.

### Step 1: Check For ICBC Updates

1. Go to the admin page.
2. Find **Knowledge Base Tools**.
3. Click:

```text
Check ICBC Updates
```

This checks the ICBC procedure map and reports possible changes.

It may show:

- new topics
- removed topics
- changed titles
- changed categories

This check is safe. It does not replace the knowledge base.

### Step 2: Review The Job Result

Look at the **Background Jobs** section.

Wait until the job says:

```text
succeeded
```

If it says `failed`, do not run the full refresh yet. Review the log shown on the admin page.

### Step 3: Run The Full ICBC Refresh

If the check found updates, click:

```text
Run Full ICBC Refresh
```

This may take several minutes.

The system will:

1. download the latest ICBC procedure list
2. download the procedure pages
3. prepare the text for searching
4. build a staging collection
5. verify the staging collection
6. replace the live ICBC collection only if the new one succeeds

### Step 4: Confirm It Finished

Watch the **Background Jobs** section.

When it says:

```text
succeeded
```

the ICBC knowledge base has been updated.

If it says:

```text
failed
```

the old ICBC data should still be used by staff. Copy the error message or take a screenshot for troubleshooting.

## Adding Shop Documents

Shop documents are added by placing files in a folder, then clicking import on the admin page.

The folder is:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\data\shop_docs\inbox
```

This folder is the source of truth.

That means:

- files in the folder will be imported
- files removed from the folder will be removed from search after the next import
- old files should be updated by replacing them in the folder

## Supported Shop Document Types

You can add:

- PDF files with selectable text
- Word documents: `.docx`
- Excel files: `.xlsx`
- Text files: `.txt`
- Markdown files: `.md`
- Saved webpages: `.html` or `.htm`
- Website URLs listed in `urls.txt`

## What Not To Add

Avoid adding:

- scanned PDFs that are just images
- password-protected PDFs
- photos or screenshots
- customer private information
- payroll or HR files unless they are intended to be searchable
- accounting exports unless approved

## Adding PDF, Word, Excel, Text, Markdown, Or HTML Files

1. Open this folder:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\data\shop_docs\inbox
```

2. Copy the files into that folder.
3. Go to the admin page.
4. Click:

```text
Scan Shop Docs
```

5. Review the scan result.
6. If the files look correct, click:

```text
Import Shop Docs
```

7. Watch **Background Jobs** until the job says `succeeded`.

## Adding Website URLs

To add webpages, create or edit this file:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\data\shop_docs\inbox\urls.txt
```

Put one website address per line.

Example:

```text
https://example.com/oem-procedure-page
https://example.com/vendor-paint-guide
```

Then:

1. Go to the admin page.
2. Click **Scan Shop Docs**.
3. Confirm the URLs appear.
4. Click **Import Shop Docs**.
5. Wait for the job to say `succeeded`.

## Updating Mitchell CEG

Mitchell CEG is handled by a special admin button because it is a group of linked web pages, not one document.

Use this only if your shop is allowed to use Mitchell CEG content internally.

### What The Button Does

The button:

1. starts at the Mitchell CEG Procedure Explanations page
2. follows only Mitchell CEG pages in the same CEG folder
3. ignores support links, account links, images, styling files, and outside websites
4. saves the pages into:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\data\shop_docs\inbox\mitchell_ceg
```

5. rebuilds the shop-doc knowledge base

### How To Run It

1. Go to the admin page.
2. Find **Knowledge Base Tools**.
3. Find **Mitchell CEG**.
4. Click:

```text
Refresh Mitchell CEG
```

5. Watch **Background Jobs** until the job says `succeeded`.

After it succeeds, staff can ask questions such as:

```text
What does Mitchell CEG say is included for bumper assembly R&I?
What does Mitchell CEG say about quarter panel sectioning?
What refinish operations are not included?
```

You do not need to manually add the Mitchell CEG page URLs to `urls.txt`.

## Excel File Notes

Excel files are imported carefully.

The system reads:

- `.xlsx` files only
- visible sheets only
- visible cell values

Hidden sheets are skipped.

Each row is turned into searchable text with the workbook name, sheet name, and row number. This helps the system understand where the information came from.

## Checking What Is Indexed

On the admin page, use:

```text
Source Index
```

This shows the URLs and documents currently known to the system.

You can use it to:

- search indexed documents
- confirm a file was imported
- see source titles
- see source type
- see chunk counts

## Removing A Shop Document

To remove a shop document from search:

1. Delete the file from:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\data\shop_docs\inbox
```

2. Go to the admin page.
3. Click:

```text
Import Shop Docs
```

After the import succeeds, the removed file should no longer be part of shop-doc search.

## If Something Goes Wrong

If a job fails:

1. Do not keep clicking the button repeatedly.
2. Look at the **Background Jobs** section.
3. Copy the error message or take a screenshot.
4. Confirm Docker/Qdrant is running.
5. Try again after the issue is fixed.

Common causes:

- internet connection problem
- ICBC website temporarily unavailable
- Qdrant is not running
- unsupported or damaged document
- password-protected PDF

## Recommended Monthly Routine

Once per month:

1. Open the admin page.
2. Click **Check ICBC Updates**.
3. If updates are found, click **Run Full ICBC Refresh**.
4. Add or remove shop docs in the inbox folder if needed.
5. Click **Scan Shop Docs**.
6. Click **Import Shop Docs** if the scan looks correct.
7. Click **Refresh Mitchell CEG** if Mitchell CEG needs to be updated.
8. Ask a test question from the staff dashboard.

Good test questions:

```text
What does ICBC policy say about ATS?
What is our SOP for aluminum repair?
What does ICBC say about pre-repair scanning?
What does Mitchell CEG say about quarter panel sectioning?
```
