param(
  [int]$Port = 8137,
  [string]$Root = "",
  [switch]$Open
)

# Local static file server built on System.Net.HttpListener (ships with Windows).
# No Python / Node needed. Handles every request on the thread pool, so a large
# <video> streaming in one connection cannot block the page's other requests.
# Supports HTTP Range requests so video seeking works.

if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$Root = (Resolve-Path $Root).Path

$source = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

public class WbStaticServer
{
    private readonly string root;
    private readonly HttpListener listener;
    private static readonly Dictionary<string, string> Mime = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".htm",  "text/html; charset=utf-8" },
        { ".css",  "text/css; charset=utf-8" },
        { ".js",   "text/javascript; charset=utf-8" },
        { ".mjs",  "text/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".png",  "image/png" },
        { ".jpg",  "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".gif",  "image/gif" },
        { ".webp", "image/webp" },
        { ".svg",  "image/svg+xml" },
        { ".ico",  "image/x-icon" },
        { ".mp4",  "video/mp4" },
        { ".webm", "video/webm" },
        { ".mp3",  "audio/mpeg" },
        { ".ttf",  "font/ttf" },
        { ".woff", "font/woff" },
        { ".woff2","font/woff2" },
        { ".txt",  "text/plain; charset=utf-8" },
        { ".pdf",  "application/pdf" }
    };

    public WbStaticServer(string rootPath, int port)
    {
        root = Path.GetFullPath(rootPath);
        listener = new HttpListener();
        listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
    }

    public void Start()
    {
        listener.Start();
        Thread t = new Thread(Loop);
        t.IsBackground = true;
        t.Start();
    }

    public void Stop()
    {
        try { listener.Stop(); listener.Close(); } catch { }
    }

    private void Loop()
    {
        while (listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = listener.GetContext(); }
            catch { break; }
            ThreadPool.QueueUserWorkItem(delegate(object state) { Handle((HttpListenerContext)state); }, ctx);
        }
    }

    private void Handle(HttpListenerContext ctx)
    {
        try { Serve(ctx); }
        catch { try { ctx.Response.StatusCode = 500; ctx.Response.Close(); } catch { } }
    }

    private void Serve(HttpListenerContext ctx)
    {
        HttpListenerRequest req = ctx.Request;
        HttpListenerResponse res = ctx.Response;

        string relative = Uri.UnescapeDataString(req.Url.AbsolutePath).TrimStart('/');
        if (relative.Length == 0) relative = "index.html";
        relative = relative.Replace('/', Path.DirectorySeparatorChar);

        string full = Path.GetFullPath(Path.Combine(root, relative));
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            res.StatusCode = 403;
            res.Close();
            return;
        }
        if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
        if (!File.Exists(full))
        {
            byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found: " + relative);
            res.StatusCode = 404;
            res.ContentType = "text/plain; charset=utf-8";
            res.ContentLength64 = notFound.Length;
            res.OutputStream.Write(notFound, 0, notFound.Length);
            res.Close();
            return;
        }

        string ext = Path.GetExtension(full);
        string type;
        if (!Mime.TryGetValue(ext, out type)) type = "application/octet-stream";

        long length = new FileInfo(full).Length;
        long start = 0;
        long end = length - 1;
        bool partial = false;

        string rangeHeader = req.Headers["Range"];
        if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
        {
            string spec = rangeHeader.Substring(6).Split(',')[0].Trim();
            string[] parts = spec.Split('-');
            long parsed;
            if (parts.Length == 2)
            {
                if (parts[0].Length > 0 && long.TryParse(parts[0], out parsed)) start = parsed;
                else if (parts[1].Length > 0 && long.TryParse(parts[1], out parsed)) start = Math.Max(0, length - parsed);
                if (parts[1].Length > 0 && long.TryParse(parts[1], out parsed)) end = parsed;
            }
            if (start >= length)
            {
                res.StatusCode = 416;
                res.Headers.Add("Content-Range", "bytes */" + length);
                res.Close();
                return;
            }
            if (end >= length) end = length - 1;
            if (end < start) end = length - 1;
            partial = true;
        }

        res.ContentType = type;
        res.Headers.Add("Accept-Ranges", "bytes");
        res.Headers.Add("Cache-Control", "no-cache");

        if (partial)
        {
            res.StatusCode = 206;
            res.Headers.Add("Content-Range", "bytes " + start + "-" + end + "/" + length);
        }
        else
        {
            res.StatusCode = 200;
        }

        long count = end - start + 1;
        res.ContentLength64 = count;

        if (req.HttpMethod == "HEAD")
        {
            res.Close();
            return;
        }

        using (FileStream fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            fs.Seek(start, SeekOrigin.Begin);
            byte[] buffer = new byte[262144];
            long remaining = count;
            while (remaining > 0)
            {
                int want = (int)Math.Min(buffer.Length, remaining);
                int read = fs.Read(buffer, 0, want);
                if (read <= 0) break;
                res.OutputStream.Write(buffer, 0, read);
                remaining -= read;
            }
        }
        res.Close();
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp

$server = New-Object WbStaticServer($Root, $Port)
try {
  $server.Start()
} catch {
  Write-Host "Cannot listen on port $Port - $($_.Exception.Message)"
  Write-Host "Another program may already be using this port."
  exit 1
}

Write-Host "Serving: $Root"
Write-Host "Open:    http://127.0.0.1:$Port/index.html"
Write-Host "Press Ctrl+C or close this window to stop."
Write-Host ""

# Only open the browser once the listener is actually up, so the page never
# lands on a "connection refused" screen.
if ($Open) {
  try { Start-Process "http://127.0.0.1:$Port/index.html" } catch { Write-Host "Please open the URL above manually." }
}

try {
  while ($true) { Start-Sleep -Seconds 3600 }
} finally {
  $server.Stop()
}
