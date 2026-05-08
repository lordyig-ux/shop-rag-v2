Terminal Autobody shop-rag Production Installer

1. Extract this zip file.
2. Right-click Install-ShopRag.bat.
3. Choose Run as administrator.
4. Enter the admin password and Ollama API key when prompted.

The installer will:
- copy the app to C:\TerminalAutobody\ShopRag
- create the Python virtual environment
- install Python requirements
- start Qdrant in Docker
- import the included ICBC data if Qdrant is empty
- import included shop docs if present
- install the ShopRag Windows service
- open Windows Firewall for port 8000
- print the dashboard URL

Before running this installer, install:
- Python 3.11 or newer
- Docker Desktop

If installation fails, check:
shop-rag\data\logs\service-error.log
