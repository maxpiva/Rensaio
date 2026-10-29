# Android on .NET

Only the **Mihon** extensions are actively maintained, and they are distributed as Android APKs. So we need to hack around that!

By leveraging the Java/Android bridge originally created by the [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server) team, and adapting parts of it to fit our use case, including replacing KCEF with JCEF Maven, we can generate a Java 8 Android compatibility layer with all required Java dependencies included.

Then use [IKVM](https://github.com/ikvmnet/ikvm) to run this on .NET.

Extensions that need a browser context spawn Chromium renderer processes; see [Resource usage](../configuration/resource-usage.md) for how those are bounded.
