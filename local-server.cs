// Windows fallback: compiled by the .NET Framework included with PowerShell.
// No administrator account, installed packages, or HTTP URL reservation needed.
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Globalization;

public sealed class NormaLocalServer : IDisposable
{
    private readonly string root;
    private readonly TcpListener listener;
    private volatile bool running;

    public NormaLocalServer(string directory, int port)
    {
        root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        running = true;
        Thread acceptThread = new Thread(AcceptLoop);
        acceptThread.IsBackground = true;
        acceptThread.Start();
    }

    private void AcceptLoop()
    {
        while (running)
        {
            try { ThreadPool.QueueUserWorkItem(Handle, listener.AcceptTcpClient()); }
            catch (SocketException) { if (!running) return; }
            catch (ObjectDisposedException) { return; }
        }
    }

    private static void Header(NetworkStream stream, int status, string reason, string type, long length)
    {
        string text = "HTTP/1.1 " + status.ToString(CultureInfo.InvariantCulture) + " " + reason + "\r\n" +
            "Content-Type: " + type + "\r\nContent-Length: " + length.ToString(CultureInfo.InvariantCulture) +
            "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
        byte[] bytes = Encoding.ASCII.GetBytes(text);
        stream.Write(bytes, 0, bytes.Length);
    }

    private static void Text(NetworkStream stream, int status, string reason, string body, bool headOnly)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        Header(stream, status, reason, "text/plain; charset=utf-8", bytes.Length);
        if (!headOnly) stream.Write(bytes, 0, bytes.Length);
    }

    private void Handle(object state)
    {
        using (TcpClient client = (TcpClient)state)
        {
            client.ReceiveTimeout = 5000;
            client.SendTimeout = 5000;
            try
            {
                using (NetworkStream stream = client.GetStream())
                {
                    byte[] buffer = new byte[4096];
                    using (MemoryStream request = new MemoryStream())
                    {
                        string headers = "";
                        while (request.Length < 32768)
                        {
                            int count = stream.Read(buffer, 0, buffer.Length);
                            if (count == 0) return;
                            request.Write(buffer, 0, count);
                            headers = Encoding.ASCII.GetString(request.ToArray());
                            if (headers.IndexOf("\r\n\r\n", StringComparison.Ordinal) >= 0) break;
                        }
                        int firstBreak = headers.IndexOf("\r\n", StringComparison.Ordinal);
                        if (firstBreak < 0) { Text(stream, 400, "Bad Request", "Bad request", false); return; }
                        string[] first = headers.Substring(0, firstBreak).Split(' ');
                        if (first.Length < 3) { Text(stream, 400, "Bad Request", "Bad request", false); return; }
                        bool headOnly = first[0] == "HEAD";
                        if (first[0] != "GET" && !headOnly) { Text(stream, 405, "Method Not Allowed", "Method not allowed", false); return; }
                        string uriPath;
                        try { uriPath = Uri.UnescapeDataString(first[1].Split('?')[0]).Replace('\\', '/'); }
                        catch { Text(stream, 400, "Bad Request", "Bad path", headOnly); return; }
                        if (!uriPath.StartsWith("/", StringComparison.Ordinal)) { Text(stream, 400, "Bad Request", "Bad path", headOnly); return; }
                        if (uriPath == "/__norma_status")
                        {
                            byte[] status = Encoding.UTF8.GetBytes("{\"app\":\"norma-workbench-local\",\"version\":\"1.0.0\"}");
                            Header(stream, 200, "OK", "application/json; charset=utf-8", status.Length);
                            if (!headOnly) stream.Write(status, 0, status.Length);
                            return;
                        }
                        string target;
                        try
                        {
                            string relative = uriPath == "/" ? "index.html" : uriPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                            target = Path.GetFullPath(Path.Combine(root, relative));
                        }
                        catch { Text(stream, 400, "Bad Request", "Bad path", headOnly); return; }
                        if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) { Text(stream, 403, "Forbidden", "Forbidden", headOnly); return; }
                        if (!File.Exists(target)) { Text(stream, 404, "Not Found", "Not found", headOnly); return; }
                        using (FileStream file = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read))
                        {
                            Header(stream, 200, "OK", Mime(target), file.Length);
                            if (!headOnly) file.CopyTo(stream);
                        }
                    }
                }
            }
            catch (IOException) { }
            catch (SocketException) { }
            catch (ObjectDisposedException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static string Mime(string file)
    {
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".jsonld": return "application/ld+json; charset=utf-8";
            case ".md": case ".txt": return "text/plain; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    public void Dispose()
    {
        running = false;
        listener.Stop();
    }
}
