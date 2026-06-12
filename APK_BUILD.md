# Android APK build

الموقع يفضل شغال على Netlify كما هو، ونسخة Android تفتح نفس الرابط:

https://hayper-asmaa.netlify.app

## المتطلبات

1. ثبّت Android Studio.
2. افتح Android Studio مرة واحدة وثبّت Android SDK وBuild Tools.
3. ثبّت Java حديث لو Android Studio طلب ذلك.
4. الأفضل يكون مسار المشروع بالإنجليزي عند بناء APK، لأن Gradle على ويندوز ممكن يتعطل مع المسار العربي.

## أول مرة فقط

```powershell
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android --save-dev
npm run android:add
```

## كل مرة قبل إخراج APK

```powershell
npm run build
npm run android:sync
npm run android:open
```

من Android Studio:

1. Build
2. Generate Signed Bundle / APK
3. APK
4. Create new key أو استخدم key موجود
5. Release
6. Finish

ملف APK غالبا هتلاقيه داخل:

```text
android/app/release/
```

## لو هتبني من PowerShell

لو المشروع موجود في مسار عربي، اعمل مسار مؤقت إنجليزي:

```powershell
$link = Join-Path $env:TEMP "hyper-asmaa-capacitor"
if (Test-Path $link) { Remove-Item -LiteralPath $link -Force }
cmd /c mklink /J "$link" "F:\saeed\هايبر اسماء"
```

استخدم Java الموجود داخل Android Studio:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

لو ظهر خطأ `SDK location not found`، افتح Android Studio وثبّت Android SDK من:

```text
Settings > Languages & Frameworks > Android SDK
```

بعد تثبيت SDK، شغّل:

```powershell
cd "$env:TEMP\hyper-asmaa-capacitor\android"
.\gradlew.bat assembleDebug
```

ملف APK التجريبي سيكون غالبا هنا:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## APKPure

بعد استخراج APK النهائي، ارفعه من حساب المطور على APKPure.

مهم: لو غيرت الموقع فقط ورفعت Netlify، التطبيق هيفتح النسخة الجديدة تلقائيا لأنه بيعرض رابط الموقع.
