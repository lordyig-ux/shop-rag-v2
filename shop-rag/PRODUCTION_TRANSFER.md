# Production Transfer Notes

This workspace has been cleaned for a future Terminal Autobody production install.

## Copy To The Production PC

Copy these items together, preserving the same folder relationship:

```text
ICBC_Scraper/
|-- extract_links.py
|-- scrape_procedures.py
|-- process_chunks.py
|-- output/
`-- shop-rag/
```

The `shop-rag` app currently expects the ICBC scraper output at:

```text
../output/chunks.jsonl
```

That is why the parent `output/` folder and the three scraper scripts still live beside `shop-rag`.

## Do Not Copy For Production

Do not copy these items to the live shop PC:

```text
archive/
shop-rag/.venv/
shop-rag/.pytest_cache/
**/__pycache__/
```

The virtual environment should be recreated on the production PC using:

```powershell
cd C:\Path\To\ICBC_Scraper\shop-rag
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Production Service Setup

For the live shop environment, use the production bundle installer instead of copying files manually.

From the development machine:

```powershell
cd C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag
.\scripts\build_production_bundle.ps1
```

Copy the newest zip from:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\dist
```

On the production server:

1. Extract the zip.
2. Right-click `Install-ShopRag.bat`.
3. Choose **Run as administrator**.
4. Enter the admin password and Ollama API key.

The installer copies the app to:

```text
C:\TerminalAutobody\ShopRag
```

It creates the Python virtual environment, installs requirements, starts Qdrant, imports included data when needed, installs the `ShopRag` Windows service, opens the firewall, and prints the dashboard URL.

## Manual Service Setup

For custom installs, install `shop-rag` as a Windows service instead of relying on `launch.bat`.

The service scripts are in:

```text
shop-rag/scripts/
```

Install NSSM to:

```text
shop-rag/tools/nssm/nssm.exe
```

Then run PowerShell as Administrator:

```powershell
cd C:\Path\To\ICBC_Scraper\shop-rag
.\scripts\install_service.ps1
```

Useful service commands:

```powershell
.\scripts\service_status.ps1
.\scripts\start_service.ps1
.\scripts\stop_service.ps1
.\scripts\uninstall_service.ps1
```

Qdrant must also restart automatically. If Qdrant runs in Docker, set:

```powershell
docker update --restart unless-stopped qdrant
```

## Keep Secure

The file below contains local configuration and secrets:

```text
shop-rag/.env
```

Copy it only through a secure method. Do not email it or put it in shared cloud storage.

## Data To Preserve

These files/folders contain the current knowledge-base source data and should be preserved:

```text
output/
shop-rag/data/source_index.sqlite
shop-rag/data/maintenance_state.json
shop-rag/data/shop_docs/inbox/
```

Qdrant data is not stored inside this project folder when Qdrant is running in Docker. For a new production PC, either:

1. re-import the ICBC and shop-doc data from the app admin page, or
2. create and restore a Qdrant snapshot/volume backup.

For the cleanest first production move, keep the source files above and re-import on the new PC after Qdrant is running.

## Archived Items

Old prototype files were moved to:

```text
..\archive\2026-04-29-pre-production-cleanup\
```

That archive includes the old Chroma vector database prototype, old recon output, and planning notes. It is not needed by the live `shop-rag` app.
