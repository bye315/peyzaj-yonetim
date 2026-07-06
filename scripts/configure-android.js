const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

// 1. Configure project-level build.gradle
const projectGradlePath = path.join(rootDir, 'android', 'build.gradle');
if (fs.existsSync(projectGradlePath)) {
  let content = fs.readFileSync(projectGradlePath, 'utf8');
  if (!content.includes('com.google.gms:google-services')) {
    content = content.replace(
      /dependencies\s*\{/,
      "dependencies {\n        classpath 'com.google.gms:google-services:4.3.15'"
    );
    fs.writeFileSync(projectGradlePath, content, 'utf8');
    console.log('Successfully configured project-level build.gradle with Google Services plugin.');
  }
} else {
  console.error('project-level build.gradle not found!');
}

// 2. Configure app-level build.gradle
const appGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
if (fs.existsSync(appGradlePath)) {
  let content = fs.readFileSync(appGradlePath, 'utf8');
  if (!content.includes("apply plugin: 'com.google.gms.google-services'")) {
    content += "\napply plugin: 'com.google.gms.google-services'\n";
    fs.writeFileSync(appGradlePath, content, 'utf8');
    console.log('Successfully configured app-level build.gradle with Google Services plugin.');
  }
} else {
  console.error('app-level build.gradle not found!');
}

// 3. Configure AndroidManifest.xml for POST_NOTIFICATIONS permission
const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let content = fs.readFileSync(manifestPath, 'utf8');
  if (!content.includes('android.permission.POST_NOTIFICATIONS')) {
    content = content.replace(
      '</manifest>',
      '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>'
    );
    fs.writeFileSync(manifestPath, content, 'utf8');
    console.log('Successfully added POST_NOTIFICATIONS permission to AndroidManifest.xml.');
  }
} else {
  console.error('AndroidManifest.xml not found!');
}
