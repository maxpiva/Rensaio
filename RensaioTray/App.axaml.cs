using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using RensaioBackend.Utils;
using RensaioTray.Utils;
using RensaioTray.Views;

namespace RensaioTray;

public partial class App : Application
{
    private IHost? _host;
    private TrayIcon? _trayIcon;

    private IntPtr _consoleWindow = IntPtr.Zero;
    private bool _isShuttingDown = false;
    private readonly CancellationTokenSource _shutdownCancellationTokenSource = new();

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            // Setup exit handlers
            desktop.Exit += async (sender, e) => await GracefulShutdownAsync();
            desktop.ShutdownRequested += (sender, e) =>
            {
                if (!_isShuttingDown)
                {
                    e.Cancel = true;
                    // GracefulShutdownAsync now disposes the tray icon, so the app can exit cleanly.
                    // If the process still refuses to exit after shutdown completes, force-exit via
                    // Environment.Exit(0) as a last resort after a timeout.
                    _ = Task.Run(async () =>
                    {
                        await GracefulShutdownAsync();
                        // Small delay to let the UI thread process the tray cleanup
                        await Task.Delay(500);
                        // Force process exit to guarantee no hang
                        Environment.Exit(0);
                    });
                }
            };

            // Check if storage folder exists
            bool rootFolderExists = EnvironmentSetup.CheckIfRootDirExists();
            
            if (!rootFolderExists)
            {
                // Show StorageFolderDialog and wait for result
                ShowStorageFolderDialogAndWait(desktop);
            }
            else
            {
                // Storage folder exists, start normally
                Task.Run(async () =>
                {
                    await EnvironmentSetup.InitializeAsync();
                    await StartApplication();
                });
            }
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void ShowStorageFolderDialogAndWait(IClassicDesktopStyleApplicationLifetime desktop)
    {
        var dialog = new StorageFolderDialog();
        desktop.MainWindow = dialog;
        
        dialog.Closed += async (sender, e) =>
        {
            var result = dialog.DialogResult ? dialog.SelectedFolderPath : null;
            
            if (!string.IsNullOrEmpty(result) && Directory.Exists(result))
            {
                try
                {

                    
                    // Hide the dialog window and start the app
                    desktop.MainWindow = null;

                    // Start the application on a background thread

                    // Initialize environment with selected folder
                    await EnvironmentSetup.InitializeAsync(result);
                    await StartApplication();
  
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to initialize with selected folder: {ex.Message}");
                    desktop.Shutdown();
                }
            }
            else
            {
                // User cancelled or selected invalid folder
                Console.WriteLine("No valid storage folder selected. Application will exit.");
                desktop.Shutdown();
            }
        };
    }

    private async Task StartApplication()
    {
        try
        {
            // Build and start the ASP.NET Core host (this can run on background thread)
            _host = RensaioBackend.Program.CreateHostBuilder(Array.Empty<string>()).Build();
            // Start the ASP.NET Core host (this can run on background thread)
            _ = Task.Run(async()=>await _host.StartAsync(_shutdownCancellationTokenSource.Token).ConfigureAwait(false));
            // Setup the tray icon on the UI thread
            Avalonia.Threading.Dispatcher.UIThread.Invoke(() =>
            {
                SetupTrayIcon();
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to start application: {ex.Message}");
        }
    }

    private async Task GracefulShutdownAsync()
    {
        if (_isShuttingDown)
            return;

        _isShuttingDown = true;

        try
        {
            if (_host != null)
            {
                // 1) Stop the host with a 30-second timeout
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(
                    _shutdownCancellationTokenSource.Token, timeoutCts.Token);

                try
                {
                    await _host.StopAsync(combinedCts.Token).ConfigureAwait(false);
                }
                catch
                {
                    // Swallow shutdown exceptions
                }

                // 2) Dispose the host — use ConfigureAwait(false) to avoid UI thread deadlock.
                // IHost.Dispose() internally calls DisposeAsync().GetAwaiter().GetResult()
                // which can deadlock on Avalonia's UI synchronization context.
                await Task.Run(() => _host.Dispose()).ConfigureAwait(false);
            }

            // 3) Clean up UI resources on the UI thread to let the event loop exit
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    // macOS: clear the Dock context menu
                    MacOsTrayInterop.ClearDockMenu();
                }
                else if (_trayIcon != null)
                {
                    // Windows / Linux: dispose the Avalonia TrayIcon
                    _trayIcon.IsVisible = false;
                    _trayIcon.Dispose();
                    _trayIcon = null;
                }
            });
        }
        finally
        {
            _shutdownCancellationTokenSource.Dispose();
        }
    }

    private void SetupTrayIcon()
    {
        try
        {
            // ── macOS: use native Objective-C interop ────────────────────
            // Avalonia 12.0.4's NativeMenu→NSMenu bridge is broken on macOS,
            // so we bypass it entirely and create a native NSStatusItem +
            // NSMenu via direct Objective-C runtime calls.
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                // macOS: populate the Dock icon's context menu via native interop
                // Avalonia's NativeMenu→NSMenu bridge is broken on macOS 12.0.4
                MacOsTrayInterop.SetDockMenu(new[]
                {
                    ("Open App in the Browser", new Action(OpenAppInBrowser)),
                    ("Show Console", new Action(ConsoleItem_Click_Mac)),
                    ("Exit", new Action(ExitApplication)),
                });
                return;
            }

            // ── Windows / Linux: use Avalonia's TrayIcon with NativeMenu ─
            var trayIcon = new TrayIcon();

            try
            {
                var uri = new Uri("avares://RensaioTray/Assets/rensaio.ico");
                using var stream = AssetLoader.Open(uri);
                Bitmap bitmap = new Bitmap(stream);
                var icon = new WindowIcon(bitmap);
                trayIcon.Icon = icon;
            }
            catch
            {
                Console.WriteLine("Could not load tray icon from resources, using default icon");
            }

            trayIcon.ToolTipText = "Rensaiō";

            var menu = new NativeMenu();

            var openItem = new NativeMenuItem("Open App in the Browser");
            openItem.Click += OpenItem_Click;

            var consoleItem = new NativeMenuItem("Show Console");
            consoleItem.Click += ConsoleItem_Click;

            var exitItem = new NativeMenuItem("Exit");
            exitItem.Click += async (sender, args) =>
            {
                await GracefulShutdownAsync();
                // Force process exit — the backend is fully stopped at this point
                Environment.Exit(0);
            };

            menu.Add(openItem);
            menu.Add(new NativeMenuItemSeparator());
            menu.Add(consoleItem);
            menu.Add(new NativeMenuItemSeparator());
            menu.Add(exitItem);

            trayIcon.Menu = menu;
            trayIcon.IsVisible = true;
            _trayIcon = trayIcon;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to setup tray icon: {ex.Message}");
        }
    }

    /// <summary>
    /// Opens the Rensaiō web interface in the default browser (macOS helper).
    /// </summary>
    private void OpenAppInBrowser()
    {
        try
        {
            var server = _host?.Services.GetService<IServer>();
            var addresses = server?.Features.Get<IServerAddressesFeature>();
            var address = addresses?.Addresses.FirstOrDefault();

            if (address != null)
            {
                var url = address.Replace("[::]", "localhost").Replace("0.0.0.0", "localhost");
                Process.Start("open", url);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to open web interface: {ex.Message}");
        }
    }

    /// <summary>
    /// Shows a terminal window (macOS helper).
    /// </summary>
    private void ConsoleItem_Click_Mac()
    {
        ShowConsoleAlternative();
    }

    /// <summary>
    /// Gracefully shuts down and exits the application (macOS helper).
    /// </summary>
    private async void ExitApplication()
    {
        await GracefulShutdownAsync();
        Environment.Exit(0);
    }


    private void ConsoleItem_Click(object? sender, EventArgs e)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            ToggleConsoleVisibility();
        }
        else
        {
            ShowConsoleAlternative();
        }
    }

    private void ToggleConsoleVisibility()
    {
        if (_consoleWindow == IntPtr.Zero)
        {
            _consoleWindow = ConsoleUtils.GetConsoleWindow();
        }

        if (_consoleWindow != IntPtr.Zero)
        {
            // Use IsWindowVisible to check the actual state of the window
            bool isVisible = AnsiConsoleUtils.IsConsoleWindowVisible();

            if (isVisible)
            {
                // Hide the console
                ConsoleUtils.ShowWindow(_consoleWindow, ConsoleUtils.SW_HIDE);
                UpdateConsoleMenuItem("Show Console");
            }
            else
            {
                // Show the console
                ConsoleUtils.ShowWindow(_consoleWindow, ConsoleUtils.SW_SHOW);
                UpdateConsoleMenuItem("Hide Console");
            }
        }
        else
        {
            Console.WriteLine("Could not get console window handle.");
        }
    }

    private void ShowConsoleAlternative()
    {
        try
        {
            var configuration = _host?.Services.GetService<IConfiguration>();
            var logPath = configuration?.GetValue<string>("Serilog:WriteTo:0:Args:path", "logs/log-.txt");

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                Process.Start("x-terminal-emulator", $"-e tail -f {logPath}");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                Process.Start("open", $"-a Terminal -n");
            }
        }
        catch
        {
            // Silently fail
        }
    }

    private void UpdateConsoleMenuItem(string text)
    {
        if (_trayIcon?.Menu != null)
        {
            foreach (var item in _trayIcon.Menu.Items)
            {
                if (item is NativeMenuItem menuItem &&
                    (menuItem.Header == "Show Console" || menuItem.Header == "Hide Console"))
                {
                    menuItem.Header = text;
                    break;
                }
            }
        }
    }

    private void OpenItem_Click(object? sender, EventArgs e)
    {
        try
        {
            var server = _host?.Services.GetService<IServer>();
            var addresses = server?.Features.Get<IServerAddressesFeature>();
            var address = addresses?.Addresses.FirstOrDefault();

            if (address != null)
            {
                var url = address.Replace("[::]", "localhost").Replace("0.0.0.0", "localhost");

                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    Process.Start("xdg-open", url);
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    Process.Start("open", url);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to open web interface: {ex.Message}");
        }
    }
}