// Consumer Insights Hub - Windows launcher.
// Starts the bundled Node runtime hidden, opens the app in the default browser and shows a tray icon (Open / Quit).
// Running the exe again while it is already running just opens the browser.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    static Process node;
    static NotifyIcon tray;
    static string url;
    static int port = 4000;

    [STAThread]
    static void Main()
    {
        string home = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(home, "app");
        string nodeExe = Path.Combine(home, "runtime", "node.exe");
        string envFile = Path.Combine(app, ".env");

        if (File.Exists(envFile))
        {
            Match m = Regex.Match(File.ReadAllText(envFile), @"^\s*PORT\s*=\s*(\d+)", RegexOptions.Multiline);
            if (m.Success) port = int.Parse(m.Groups[1].Value);
        }
        url = "http://localhost:" + port;

        bool created;
        using (Mutex mutex = new Mutex(true, "Local\\ConsumerInsightsHub_" + port, out created))
        {
            if (!created) { Open(); return; }                       // already running
            if (IsUp()) { Open(); return; }                         // something (e.g. a previous orphan) already serves the app

            if (!File.Exists(nodeExe) || !Directory.Exists(app))
            {
                MessageBox.Show("The application files are missing. Please keep ConsumerInsightsHub.exe together with its 'app' and 'runtime' folders.",
                    "Consumer Insights Hub", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ProcessStartInfo psi = new ProcessStartInfo(nodeExe, "--disable-warning=ExperimentalWarning backend\\server.js");
            psi.WorkingDirectory = app;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.EnvironmentVariables["CIH_LAUNCHER"] = "1";
            string logDir = Path.Combine(home, "data");
            Directory.CreateDirectory(logDir);
            string logFile = Path.Combine(logDir, "server.log");
            try { if (File.Exists(logFile) && new FileInfo(logFile).Length > 2000000) File.Delete(logFile); } catch { }
            StreamWriter log = null;
            try { log = new StreamWriter(new FileStream(logFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) { AutoFlush = true }; } catch { }
            node = new Process { StartInfo = psi };
            DataReceivedEventHandler h = (s, e) => { if (e.Data != null && log != null) { lock (log) log.WriteLine(e.Data); } };
            node.OutputDataReceived += h;
            node.ErrorDataReceived += h;
            node.Start();
            node.BeginOutputReadLine();
            node.BeginErrorReadLine();

            // wait up to 30 s for the server to answer
            DateTime until = DateTime.Now.AddSeconds(30);
            while (DateTime.Now < until && !node.HasExited && !IsUp()) Thread.Sleep(250);
            if (node.HasExited || !IsUp())
            {
                MessageBox.Show("The application could not start" + (node.HasExited ? "" : " in time") + ".\n\nCommon cause: port " + port +
                    " is used by another program. Details: " + logFile, "Consumer Insights Hub", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Stop();
                return;
            }

            Application.EnableVisualStyles();
            tray = new NotifyIcon();
            tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            tray.Text = "Consumer Insights Hub";
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open Consumer Insights Hub", null, (s, e) => Open());
            menu.Items.Add("Quit (stops the application)", null, (s, e) => { tray.Visible = false; Stop(); Application.Exit(); });
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => Open();
            tray.Visible = true;
            tray.ShowBalloonTip(4000, "Consumer Insights Hub is running", "It opens in your browser. Right-click this icon to quit.", ToolTipIcon.Info);

            node.EnableRaisingEvents = true;
            node.Exited += (s, e) => { if (tray != null) tray.Visible = false; Application.Exit(); };

            Open();
            Application.Run();
            if (tray != null) tray.Visible = false;
        }
    }

    static bool IsUp()
    {
        try
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create(url + "/api/health");
            r.Timeout = 800;
            using (r.GetResponse()) return true;
        }
        catch (WebException ex) { return ex.Response != null; }   // an HTTP error still means a server answered
        catch { return false; }
    }

    static void Open()
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }

    // Ask the server to close the database cleanly; kill only if it does not stop.
    static void Stop()
    {
        if (node == null || node.HasExited) return;
        try
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create(url + "/__shutdown");
            r.Method = "POST"; r.ContentLength = 0; r.Timeout = 3000;
            using (r.GetResponse()) { }
        }
        catch { }
        if (!node.WaitForExit(6000)) { try { node.Kill(); } catch { } }
    }
}
