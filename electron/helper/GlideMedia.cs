// Glide helper process.
//  • prints the current "now playing" session as JSON lines (WinRT SMTC)
//  • on "boost <ms>" (stdin) keeps a DXGI desktop-duplication session alive for that long.
//    While duplication is active, Windows composes Glide's frames promptly even when another
//    app (Blender, a game) saturates the GPU. Doing it here keeps Glide's UI thread free.
// Built with the in-box .NET Framework compiler by scripts/build-helper.js.
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;

static class Program
{
    static volatile bool mediaOn = true;
    static readonly object outLock = new object();

    static void Emit(string line) { lock (outLock) { Console.WriteLine(line); Console.Out.Flush(); } }
    public static void Note(string line) { Emit(line); }
    public static string Q(string s) { return J(s); }

    static void Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        foreach (var a in args) if (a == "--no-media") mediaOn = false;
        var stdin = new Thread(ReadCommands) { IsBackground = true };
        stdin.Start();
        Boost.Warm();
        try { RunMedia().GetAwaiter().GetResult(); }
        catch (Exception e) { Emit("{\"error\":" + J(e.Message) + "}"); Thread.Sleep(Timeout.Infinite); }
    }

    static void ReadCommands()
    {
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            line = line.Trim();
            if (Environment.GetEnvironmentVariable("GLIDE_HELPER_TRACE") == "1") Emit("{\"cmd\":" + J(line) + "}");
            if (line.StartsWith("boost"))
            {
                int ms = 1500;
                var parts = line.Split(' ');
                if (parts.Length > 1) int.TryParse(parts[1], out ms);
                Boost.Request(ms);
            }
            else if (line == "media on") mediaOn = true;
            else if (line == "media off") mediaOn = false;
        }
        Environment.Exit(0); // parent went away
    }

    // ───────────────────────── now playing ─────────────────────────
    static string J(string s)
    {
        if (s == null) return "null";
        var b = new StringBuilder("\"");
        foreach (var c in s)
        {
            switch (c)
            {
                case '"': b.Append("\\\""); break;
                case '\\': b.Append("\\\\"); break;
                case '\n': b.Append("\\n"); break;
                case '\r': b.Append("\\r"); break;
                case '\t': b.Append("\\t"); break;
                default: if (c < 0x20) b.AppendFormat("\\u{0:x4}", (int)c); else b.Append(c); break;
            }
        }
        return b.Append('"').ToString();
    }

    static string N(double d) { return double.IsNaN(d) || double.IsInfinity(d) ? "0" : d.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture); }

    static async Task<string> ReadArt(IRandomAccessStreamReference r)
    {
        if (r == null) return null;
        try
        {
            using (var s = await r.OpenReadAsync())
            {
                ulong size = s.Size;
                if (size == 0 || size > 4000000) return null;
                var reader = new DataReader(s);
                await reader.LoadAsync((uint)size);
                var bytes = new byte[size];
                reader.ReadBytes(bytes);
                return Convert.ToBase64String(bytes);
            }
        }
        catch { return null; }
    }

    static async Task RunMedia()
    {
        var mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        string lastKey = "", lastSig = "";
        while (true)
        {
            if (!mediaOn) { await Task.Delay(1500); continue; }
            try
            {
                var s = mgr.GetCurrentSession();
                if (s == null)
                {
                    if (lastSig != "none") { Emit("{\"session\":null}"); lastSig = "none"; lastKey = ""; }
                }
                else
                {
                    var p = await s.TryGetMediaPropertiesAsync();
                    var info = s.GetPlaybackInfo();
                    var tl = s.GetTimelineProperties();
                    string key = s.SourceAppUserModelId + "|" + p.Title + "|" + p.Artist + "|" + p.AlbumTitle;
                    bool changed = key != lastKey;
                    string art = changed ? await ReadArt(p.Thumbnail) : null;
                    double pos = tl.Position.TotalSeconds, dur = (tl.EndTime - tl.StartTime).TotalSeconds;
                    int status = (int)info.PlaybackStatus;
                    string sig = key + "|" + status + "|" + Math.Round(pos) + "|" + Math.Round(dur);
                    if (sig != lastSig || changed)
                    {
                        var c = info.Controls;
                        var sb = new StringBuilder("{\"session\":{");
                        sb.Append("\"app\":").Append(J(s.SourceAppUserModelId));
                        sb.Append(",\"title\":").Append(J(p.Title));
                        sb.Append(",\"artist\":").Append(J(p.Artist));
                        sb.Append(",\"album\":").Append(J(p.AlbumTitle));
                        sb.Append(",\"status\":").Append(status);
                        sb.Append(",\"canPrev\":").Append(c.IsPreviousEnabled ? "true" : "false");
                        sb.Append(",\"canNext\":").Append(c.IsNextEnabled ? "true" : "false");
                        sb.Append(",\"canToggle\":").Append(c.IsPlayPauseToggleEnabled ? "true" : "false");
                        sb.Append(",\"position\":").Append(N(pos));
                        sb.Append(",\"duration\":").Append(N(dur));
                        sb.Append(",\"updated\":").Append(tl.LastUpdatedTime.ToUnixTimeMilliseconds());
                        if (changed) sb.Append(",\"artChanged\":true,\"art\":").Append(J(art));
                        sb.Append("}}");
                        Emit(sb.ToString());
                        lastSig = sig;
                    }
                    lastKey = key;
                }
            }
            catch { }
            await Task.Delay(900);
        }
    }
}

// ───────────────────────── DXGI duplication boost ─────────────────────────
static class Boost
{
    [DllImport("d3d11.dll")]
    static extern int D3D11CreateDevice(IntPtr adapter, int driverType, IntPtr software, uint flags, IntPtr levels, uint numLevels, uint sdk, out IntPtr device, out int level, out IntPtr context);

    [StructLayout(LayoutKind.Sequential, Size = 48)]
    struct FrameInfo { public long LastPresentTime; }

    // Vtable-order declarations; unused slots are placeholders and never called.
    [ComImport, Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIDevice
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        [PreserveSig] int GetAdapter(out IDXGIAdapter adapter);
    }

    [ComImport, Guid("2411e7e1-12ac-4ccf-bd14-9798e8534dc0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIAdapter
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        [PreserveSig] int EnumOutputs(uint index, out IDXGIOutput output);
    }

    [ComImport, Guid("ae02eedb-c735-4690-8d52-5a8dc20213aa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIOutput { }

    [ComImport, Guid("00cddea8-939b-4b83-a340-a685226666cc"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIOutput1
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        void _GetDesc(); void _GetDisplayModeList(); void _FindClosestMatchingMode(); void _WaitForVBlank();
        void _TakeOwnership(); void _ReleaseOwnership(); void _GetGammaControlCapabilities(); void _SetGammaControl();
        void _GetGammaControl(); void _SetDisplaySurface(); void _GetDisplaySurfaceData(); void _GetFrameStatistics();
        void _GetDisplayModeList1(); void _FindClosestMatchingMode1(); void _GetDisplaySurfaceData1();
        [PreserveSig] int DuplicateOutput([MarshalAs(UnmanagedType.IUnknown)] object device, out IDXGIOutputDuplication dup);
    }

    [ComImport, Guid("191cfac3-a341-470d-b26e-a864f428319c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIOutputDuplication
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        void _GetDesc();
        [PreserveSig] int AcquireNextFrame(uint timeoutMs, out FrameInfo info, out IntPtr resource);
        void _GetFrameDirtyRects(); void _GetFrameMoveRects(); void _GetFramePointerShape();
        void _MapDesktopSurface(); void _UnMapDesktopSurface();
        [PreserveSig] int ReleaseFrame();
    }

    static readonly object gate = new object();
    static readonly System.Diagnostics.Stopwatch clock = System.Diagnostics.Stopwatch.StartNew();
    static readonly AutoResetEvent wake = new AutoResetEvent(false);
    static long until;
    static Thread worker;
    static bool trace = Environment.GetEnvironmentVariable("GLIDE_HELPER_TRACE") == "1";

    // Device creation can take seconds on a busy GPU, so do it once, up front, and keep it.
    static object device;
    static IDXGIOutput1 output1;

    public static void Warm()
    {
        lock (gate)
        {
            if (worker != null) return;
            worker = new Thread(Loop) { IsBackground = true, Priority = ThreadPriority.AboveNormal };
            worker.Start();
        }
    }

    public static void Request(int ms)
    {
        Warm();
        long t = clock.ElapsedMilliseconds + Math.Max(200, Math.Min(5000, ms));
        lock (gate) { if (t > until) until = t; }
        wake.Set();
    }

    static bool Init()
    {
        try
        {
            IntPtr dev, ctx; int level;
            int hr = D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out dev, out level, out ctx);
            if (hr < 0) { Program.Note("{\"boost\":\"nodevice\",\"hr\":" + hr + "}"); return false; }
            if (ctx != IntPtr.Zero) Marshal.Release(ctx);
            device = Marshal.GetObjectForIUnknown(dev);
            Marshal.Release(dev);
            IDXGIAdapter adapter;
            if (((IDXGIDevice)device).GetAdapter(out adapter) < 0) return false;
            IDXGIOutput output;
            if (adapter.EnumOutputs(0, out output) < 0) return false;
            output1 = (IDXGIOutput1)output;
            if (trace) Program.Note("{\"boost\":\"ready\",\"t\":" + clock.ElapsedMilliseconds + "}");
            return true;
        }
        catch (Exception e) { Program.Note("{\"boost\":\"error\",\"msg\":" + Program.Q(e.Message) + "}"); return false; }
    }

    static void Loop()
    {
        if (!Init()) return;
        while (true)
        {
            wake.WaitOne();
            if (clock.ElapsedMilliseconds >= Interlocked.Read(ref until)) continue;
            IDXGIOutputDuplication dup = null;
            int frames = 0;
            try
            {
                int hr = output1.DuplicateOutput(device, out dup);
                if (hr < 0 || dup == null)
                {
                    if (trace) Program.Note("{\"boost\":\"failed\",\"hr\":" + hr + "}");
                    if (hr == unchecked((int)0x887A0026)) { Marshal.ReleaseComObject(device); Init(); } // access lost: rebuild
                    continue;
                }
                while (clock.ElapsedMilliseconds < Interlocked.Read(ref until))
                {
                    FrameInfo info; IntPtr res;
                    hr = dup.AcquireNextFrame(16, out info, out res);
                    if (hr >= 0) { frames++; if (res != IntPtr.Zero) Marshal.Release(res); dup.ReleaseFrame(); }
                    else if (hr != unchecked((int)0x887A0027)) break; // anything but WAIT_TIMEOUT ends the session
                }
            }
            catch (Exception e) { if (trace) Program.Note("{\"boost\":\"error\",\"msg\":" + Program.Q(e.Message) + "}"); }
            finally { if (dup != null) Marshal.ReleaseComObject(dup); }
            if (trace) Program.Note("{\"boost\":\"done\",\"frames\":" + frames + ",\"t\":" + clock.ElapsedMilliseconds + "}");
        }
    }
}
