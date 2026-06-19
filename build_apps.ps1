param(
    [switch]$SkipBuild
)

$backendPath = "./RensaioBackend"
$trayPath = "./RensaioTray"
$project = "RensaioBackend.csproj"
$projectTray = "RensaioTray.csproj"

$trayOutputBase = "bin/App"
$finalName = "Rensaio"

$runtimeIds = @("win-x64", "win-arm64", "linux-x64", "linux-arm64", "osx-arm64")

if (-not $SkipBuild) {
    # Build Backend for all targets
    Push-Location $backendPath
    dotnet restore $project

    foreach ($rid in $runtimeIds) {
        dotnet publish $project -c Release -r $rid
    }
    Pop-Location

    # Build Tray as self-contained for all targets
    Push-Location $trayPath

    foreach ($rid in $runtimeIds) {
        $outputPath = "$trayOutputBase/$rid"
        dotnet publish $projectTray -c Release -r $rid --self-contained true `
            -p:PublishAot=false `
            -p:PublishReadyToRun=false `
            -p:DebugSymbols=false `
            -p:DebugType=none `
            -o $outputPath
    }

    # Stay in $trayPath for the rest of the script (cleanup, bundling, archiving)
}
else {
    Write-Host "Skipping build (--SkipBuild). Using existing binaries."
    # Enter the tray directory for the rest of the script
    Push-Location $trayPath
}

# Clean up publish output: only remove debug symbols (.pdb files).
# All other files (DLLs, IKVM data, runtimes, configs) are required at runtime.
foreach ($rid in $runtimeIds) {
    $outputPath = "$trayOutputBase/$rid"

    # Remove debug symbols only
    Get-ChildItem -Path $outputPath -Filter "*.pdb" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force
}


$trayBaseName = "RensaioTray"
$version = $null

foreach ($rid in $runtimeIds) {
    $outputPath = "$trayOutputBase/$rid"
    $isWindows = $rid -like "win-*"
    $ext = if ($isWindows) { ".exe" } else { "" }

    $oldExe = Join-Path $outputPath "$trayBaseName$ext"
    $newExe = Join-Path $outputPath "$finalName$ext"

    # Rename Tray to Final
    if (Test-Path $oldExe) {
	    if (Test-Path $newExe) {
        	Remove-Item $newExe -Force
    	}
        Rename-Item -Path $oldExe -NewName (Split-Path $newExe -Leaf)
    }

    # Extract version from win-x64 only
    if ($rid -eq "win-x64" -and -not $version) {
        $exePath = Resolve-Path $newExe
        $version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exePath).FileVersion
    }

    # For macOS, create a proper .app bundle so Finder recognizes it as an application
    if ($rid -eq "osx-arm64") {
        $appDir = Join-Path $outputPath "$finalName.app"
        $macosDir = Join-Path $appDir "Contents/MacOS"
        $contentsDir = Join-Path $appDir "Contents"
        $trayDir = $PWD.ProviderPath

        # Create the bundle directory structure
        New-Item -ItemType Directory -Path $macosDir -Force | Out-Null

        # Move the entire output directory into Contents/MacOS/
        # This includes the executable, all DLLs, ikvm/, runtimes/, configs — everything needed at runtime
        Get-ChildItem -Path $outputPath -Exclude "$finalName.app" | ForEach-Object {
            $dest = Join-Path $macosDir $_.Name
            Move-Item -Path $_.FullName -Destination $dest -Force
        }

        # Copy Info.plist to Contents/
        $appBundleInfoPlist = Join-Path $trayDir "AppBundle/Info.plist"
        if (Test-Path $appBundleInfoPlist) {
            Copy-Item -Path $appBundleInfoPlist -Destination (Join-Path $contentsDir "Info.plist") -Force
        }

        # Copy application icon (.icns) to Contents/Resources/ if it exists
        # Check both AppBundle/ (user-friendly) and Assets/ (standard location)
        $resourcesDir = Join-Path $appDir "Contents/Resources"
        $iconPath1 = Join-Path $trayDir "AppBundle/rensaio.icns"
        $iconPath2 = Join-Path $trayDir "Assets/rensaio.icns"
        foreach ($iconPath in @($iconPath1, $iconPath2)) {
            if (Test-Path $iconPath) {
                New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
                Copy-Item -Path $iconPath -Destination (Join-Path $resourcesDir "rensaio.icns") -Force
                Write-Host "Copied icon: $iconPath -> $resourcesDir/rensaio.icns"
                break
            }
        }
    }
}

# Helper: create a zip archive from a directory, preserving Unix executable bits
# macOS's Archive Utility reads Unix permissions from zip external attributes.
function New-ZipWithPermissions {
    param(
        [string]$SourceDir,
        [string]$Destination,
        [string[]]$ExecutablePaths  # paths relative to SourceDir that should be executable
    )

    $execSet = @{}
    foreach ($ep in $ExecutablePaths) {
        $execSet[$ep.Replace('\', '/')] = $true
    }

    $resolvedSourceDir = [System.IO.Path]::GetFullPath($SourceDir)
    $resolvedDest = [System.IO.Path]::GetFullPath($Destination)

    # Unix mode values: 0100644 (regular file) and 0100755 (executable)
    $modeFile = 0x81A4  # 0100644
    $modeExe  = 0x81ED  # 0100755

    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

    $zipStream = [System.IO.File]::Open($resolvedDest, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            $allFiles = [System.IO.Directory]::GetFiles($resolvedSourceDir, '*', [System.IO.SearchOption]::AllDirectories)
            foreach ($fullPath in $allFiles) {
                $relativePath = $fullPath.Substring($resolvedSourceDir.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')

                $unixMode = $modeFile
                if ($execSet.ContainsKey($relativePath)) {
                    $unixMode = $modeExe
                }

                $entryName = "Rensaio.app/$relativePath"
                $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $entryStream = $entry.Open()
                try {
                    $entryStream.Write($bytes, 0, $bytes.Length)
                }
                finally {
                    $entryStream.Close()
                }

                # Set Unix external attributes via reflection.
                # _externalFileAttr is UInt32 in NETFX (PS5) / Int32 in NetCore (PS7).
                # Use [long] for the shift to avoid signed 32-bit overflow,
                # then cast to the field's own type.
                $entryType = $entry.GetType()
                $externalAttr = $entryType.GetField('_externalFileAttr', [System.Reflection.BindingFlags]'NonPublic,Instance')
                if ($externalAttr -ne $null) {
                    $attrVal = [long]$unixMode -shl 16
                    if ($externalAttr.FieldType -eq [UInt32]) {
                        $externalAttr.SetValue($entry, [UInt32]$attrVal)
                    } else {
                        $externalAttr.SetValue($entry, [Int32]$attrVal)
                    }
                }
            }
        }
        finally {
            $zip.Dispose()
        }
    }
    finally {
        $zipStream.Close()
    }
}

# Create distribution archives
foreach ($rid in $runtimeIds) {
    $outputPath = "$trayOutputBase/$rid"
    $isWindows = $rid -like "win-*"
    $isOsx = $rid -eq "osx-arm64"
    $ext = if ($isWindows) { ".exe" } else { "" }
    $archiveBase = "bin/Rensaio-$rid-v$version"

    if ($isOsx) {
        # macOS: zip the .app bundle with Unix permissions preserved
        $archiveName = "$archiveBase.zip"
        $appDir = Join-Path $outputPath "$finalName.app"
        $archiveFullPath = Join-Path $PWD $archiveName
        $resolvedAppDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PWD.ProviderPath, $appDir))

        if (Test-Path $archiveFullPath) {
            Remove-Item $archiveFullPath -Force
        }

        if (Test-Path $resolvedAppDir) {
            Write-Host "Creating macOS bundle archive: $archiveName"
            New-ZipWithPermissions -SourceDir $resolvedAppDir -Destination $archiveFullPath -ExecutablePaths @("Contents/MacOS/$finalName")
        }
    } elseif ($isWindows) {
        # Windows: zip the entire output directory
        $archiveName = "$archiveBase.zip"
        $archiveFullPath = Join-Path $PWD $archiveName

        if (Test-Path $archiveFullPath) {
            Remove-Item $archiveFullPath -Force
        }

        if (Test-Path $outputPath) {
            Write-Host "Creating Windows archive: $archiveName"
            Compress-Archive -Path "$outputPath/*" -DestinationPath $archiveFullPath
        }
    } else {
        # Linux: zip the entire output directory
        $archiveName = "$archiveBase.zip"
        $archiveFullPath = Join-Path $PWD $archiveName

        if (Test-Path $archiveFullPath) {
            Remove-Item $archiveFullPath -Force
        }

        if (Test-Path $outputPath) {
            Write-Host "Creating Linux archive: $archiveName"
            Compress-Archive -Path "$outputPath/*" -DestinationPath $archiveFullPath
        }
    }
}
Pop-Location
