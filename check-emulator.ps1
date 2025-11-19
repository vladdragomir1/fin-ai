Write-Host ' Verificam emulator-ul...' -ForegroundColor Cyan
& 'C:\Users\Vlad\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices
Write-Host ''
Write-Host ' Daca vezi emulator-5554 device -> emulatorul ruleaza!' -ForegroundColor Green
Write-Host '  Daca vezi offline/no devices -> porneste-l din Android Studio' -ForegroundColor Yellow
