using Avalonia;
using RensaioBackend.Utils;
using RensaioTray.Utils;
using System;
using System.Runtime.InteropServices;

namespace RensaioTray;

static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        java.lang.System.setProperty("java.awt.headless", "true");
        if (!EnvironmentSetup.IsApplicationAlreadyRunning())
        {
            try
            {
                // On Windows, set up the console before doing anything else.
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    InitializeConsole();
                }
                
                // Build and run the Avalonia application.
                BuildAvaloniaApp().StartWithClassicDesktopLifetime(args, Avalonia.Controls.ShutdownMode.OnExplicitShutdown);
            }
            catch (Exception ex)
            {
                // Log any critical startup errors.
                Console.WriteLine($"Application startup failed: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Allocates a console, sets its icon, disables the close button, and hides it.
    /// </summary>
    private static void InitializeConsole()
    {
        // Allocate a new console window for the application.
        if (ConsoleUtils.AllocConsole())
        {
            // Set the console icon
            if (!ConsoleUtils.SetConsoleIcon())
            {
                Console.WriteLine("Warning: Failed to set console icon.");
            }

            // Disable the close button on the console window.
            if (!ConsoleUtils.DisableConsoleCloseButton())
            {
                Console.WriteLine("Warning: Failed to disable the console close button. The console may be closeable by the user.");
            }

            // Hide the console window initially. It can be shown later by the application logic.
            IntPtr consoleWindow = ConsoleUtils.GetConsoleWindow();
            if (consoleWindow != IntPtr.Zero)
            {
                ConsoleUtils.ShowWindow(consoleWindow, ConsoleUtils.SW_HIDE);
            }
        }
        else
        {
            Console.WriteLine("Could not allocate a new console.");
        }
    }

    /// <summary>
    /// Configures and builds the Avalonia application.
    /// </summary>
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
