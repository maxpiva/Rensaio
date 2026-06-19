using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace RensaioTray.Utils;

/// <summary>
/// Sets a custom context menu on the macOS Dock icon via direct Objective-C runtime interop.
///
/// On macOS, the app's Dock icon shows a context menu when right-clicked. This class
/// populates that menu with custom items ("Open App", "Show Console", "Exit") using
/// [[NSApplication sharedApplication] setDockMenu:].
///
/// This is needed because Avalonia 12.0.4's NativeMenu bridge to native NSMenu is
/// broken on macOS.
/// </summary>
public static class MacOsTrayInterop
{
    // Objective-C method type encoding: v@:@ means void return, id self, SEL _cmd, id sender
    private const string MethodTypeEncoding = "v@:@";

    // ──────────────────────────────────────────────────────────────
    //  Objective-C Runtime DllImports
    // ──────────────────────────────────────────────────────────────

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr objc_getClass(string name);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr sel_registerName(string name);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr objc_msgSend(IntPtr receiver, IntPtr selector);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr objc_msgSend_IntPtr(IntPtr receiver, IntPtr selector, IntPtr arg);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr objc_msgSend_IntPtr_3(
        IntPtr receiver, IntPtr selector, IntPtr arg1, IntPtr arg2, IntPtr arg3);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern void objc_msgSend_void(IntPtr receiver, IntPtr selector);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern void objc_msgSend_void_IntPtr(IntPtr receiver, IntPtr selector, IntPtr arg);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr objc_allocateClassPair(IntPtr superClass, string name, int extraBytes);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern void objc_registerClassPair(IntPtr cls);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern bool class_addMethod(IntPtr cls, IntPtr sel, IntPtr imp, string types);

    [DllImport("/usr/lib/libobjc.dylib")]
    private static extern IntPtr class_createInstance(IntPtr cls, int extraBytes);

    // ──────────────────────────────────────────────────────────────
    //  Internal State
    // ──────────────────────────────────────────────────────────────

    private static IntPtr _targetClass;
    private static IntPtr _targetInstance;
    private static int _nextMenuItemTag;

    // Maps selector pointer → managed Action for menu item click dispatch
    private static readonly Dictionary<IntPtr, Action> s_actionMap = new();

    // Keeps delegates pinned to prevent garbage collection
    private static readonly List<GCHandle> s_pinnedHandles = new();

    // The single IMP (method implementation) used for ALL menu item selectors
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate IntPtr ObjCMethodDispatcher(IntPtr self, IntPtr cmd);

    private static readonly ObjCMethodDispatcher s_dispatcher;
    private static readonly IntPtr s_dispatcherPtr;

    static MacOsTrayInterop()
    {
        s_dispatcher = ActionDispatcher;
        var handle = GCHandle.Alloc(s_dispatcher);
        s_pinnedHandles.Add(handle);
        s_dispatcherPtr = Marshal.GetFunctionPointerForDelegate(s_dispatcher);
    }

    /// <summary>
    /// The shared method implementation for all menu item selectors.
    /// Looks up the selector (_cmd) in s_actionMap and invokes the associated Action.
    /// </summary>
    private static IntPtr ActionDispatcher(IntPtr self, IntPtr cmd)
    {
        if (s_actionMap.TryGetValue(cmd, out var action))
        {
            action();
        }
        return IntPtr.Zero;
    }

    // ──────────────────────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Sets the Dock context menu on macOS with the specified items.
    /// Call from the UI thread only.
    /// </summary>
    /// <param name="menuItems">Array of (title, action) tuples for the Dock menu.</param>
    public static void SetDockMenu((string title, Action action)[] menuItems)
    {
        var pool = CreateAutoreleasePool();
        try
        {
            // Get NSApplication sharedApplication (NSApp)
            var nsAppClass = objc_getClass("NSApplication");
            var sharedAppSel = sel_registerName("sharedApplication");
            var nsApp = objc_msgSend(nsAppClass, sharedAppSel);
            if (nsApp == IntPtr.Zero) return;

            // Ensure target class for action dispatching
            EnsureTargetClass();

            // Create NSMenu: [[NSMenu alloc] init]
            var nsMenuClass = objc_getClass("NSMenu");
            var allocSel = sel_registerName("alloc");
            var initSel = sel_registerName("init");
            var menu = objc_msgSend(objc_msgSend(nsMenuClass, allocSel), initSel);

            // Add menu items
            for (int i = 0; i < menuItems.Length; i++)
            {
                if (i > 0)
                {
                    // Add separator before each item after the first
                    var separatorItemSel = sel_registerName("separatorItem");
                    var separator = objc_msgSend(nsMenuClass, separatorItemSel);
                    var addItemSel = sel_registerName("addItem:");
                    objc_msgSend_void_IntPtr(menu, addItemSel, separator);
                }

                AddMenuItemToMenu(menu, menuItems[i].title, menuItems[i].action);
            }

            // Set Dock menu: [NSApp setDockMenu:menu]
            var setDockMenuSel = sel_registerName("setDockMenu:");
            objc_msgSend_void_IntPtr(nsApp, setDockMenuSel, menu);
        }
        finally
        {
            DrainAutoreleasePool(pool);
        }
    }

    /// <summary>
    /// Restores the Dock menu to its default state (removes custom items).
    /// </summary>
    public static void ClearDockMenu()
    {
        var pool = CreateAutoreleasePool();
        try
        {
            var nsAppClass = objc_getClass("NSApplication");
            var sharedAppSel = sel_registerName("sharedApplication");
            var nsApp = objc_msgSend(nsAppClass, sharedAppSel);
            if (nsApp == IntPtr.Zero) return;

            var setDockMenuSel = sel_registerName("setDockMenu:");
            objc_msgSend_void_IntPtr(nsApp, setDockMenuSel, IntPtr.Zero);
        }
        finally
        {
            DrainAutoreleasePool(pool);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Private Helpers
    // ──────────────────────────────────────────────────────────────

    private static IntPtr CreateAutoreleasePool()
    {
        var nsAutoreleasePoolClass = objc_getClass("NSAutoreleasePool");
        var allocSel = sel_registerName("alloc");
        var initSel = sel_registerName("init");
        return objc_msgSend(objc_msgSend(nsAutoreleasePoolClass, allocSel), initSel);
    }

    private static void DrainAutoreleasePool(IntPtr pool)
    {
        if (pool != IntPtr.Zero)
        {
            var drainSel = sel_registerName("drain");
            objc_msgSend(pool, drainSel);
        }
    }

    private static IntPtr NSStringFromString(string text)
    {
        var nsStringClass = objc_getClass("NSString");
        var stringWithUTF8StringSel = sel_registerName("stringWithUTF8String:");
        var utf8Ptr = Marshal.StringToCoTaskMemUTF8(text);
        try
        {
            return objc_msgSend_IntPtr(nsStringClass, stringWithUTF8StringSel, utf8Ptr);
        }
        finally
        {
            Marshal.FreeCoTaskMem(utf8Ptr);
        }
    }

    private static void EnsureTargetClass()
    {
        if (_targetClass != IntPtr.Zero)
            return;

        var nsObjectClass = objc_getClass("NSObject");
        _targetClass = objc_allocateClassPair(nsObjectClass, "RensaioDockMenuTarget", 0);
        objc_registerClassPair(_targetClass);
        _targetInstance = class_createInstance(_targetClass, 0);
    }

    private static void AddMenuItemToMenu(IntPtr menu, string title, Action action)
    {
        int tag = _nextMenuItemTag++;
        string selectorName = $"rensaiDockAction{tag}:";
        var selector = sel_registerName(selectorName);

        class_addMethod(_targetClass, selector, s_dispatcherPtr, MethodTypeEncoding);
        s_actionMap[selector] = action;

        var nsMenuItemClass = objc_getClass("NSMenuItem");
        var allocSel = sel_registerName("alloc");
        var initWithTitleSel = sel_registerName("initWithTitle:action:keyEquivalent:");
        var nsTitle = NSStringFromString(title);
        var nsEmptyKey = NSStringFromString("");
        var menuItem = objc_msgSend_IntPtr_3(
            objc_msgSend(nsMenuItemClass, allocSel),
            initWithTitleSel, nsTitle, selector, nsEmptyKey);

        var setTargetSel = sel_registerName("setTarget:");
        objc_msgSend_void_IntPtr(menuItem, setTargetSel, _targetInstance);

        var addItemSel = sel_registerName("addItem:");
        objc_msgSend_void_IntPtr(menu, addItemSel, menuItem);
    }
}