const fs = require('fs');
let content = fs.readFileSync('/root/workspace/upload-server/public/index.html', 'utf-8');
// Fix the corrupted PASSWORD line
content = content.replace(
  /var PASSWORD=String\.\.\.\d+\);/,
  "var PASSWORD=String.fromCharCode(104,101,114,109,101,115,50,48,50,52);"
);
// Also fix corrupted patterns where ... consumed newline
content = content.replace(
  /var PASSWORD=String\.\.\w+/,
  "var PASSWORD=String.fromCharCode(104,101,114,109,101,115,50,48,50,52)"
);
fs.writeFileSync('/root/workspace/upload-server/public/index.html', content, 'utf-8');
console.log('Done');
