const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '185.232.14.208',
  port: 65002,
  username: 'u880916130',
  password: 'RAJOURIgarden@1996',
  readyTimeout: 30000,
};

const zipPath = path.join(__dirname, '..', 'deploy_public_html.zip');

const conn = new Client();

console.log('Connecting to Hostinger SSH server...');

conn.on('ready', () => {
  console.log('SSH Connection established successfully!');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP Error:', err);
      conn.end();
      return;
    }

    console.log('Uploading deploy_public_html.zip to server...');
    const remoteZip = 'deploy_public_html.zip';

    sftp.fastPut(zipPath, remoteZip, (err) => {
      if (err) {
        console.error('Upload Error:', err);
        conn.end();
        return;
      }

      console.log('deploy_public_html.zip uploaded successfully!');
      console.log('Extracting archive into public_html...');

      // Run unzip command in SSH shell
      const cmd = `
        TARGET_DIR="/home/u880916130/domains/roofingclients.us/public_html"
        mkdir -p "$TARGET_DIR" 2>/dev/null || true
        ZIP_FILE=$(find /home/u880916130/ -name deploy_public_html.zip -type f 2>/dev/null | head -n 1)
        echo "Found zip file at: $ZIP_FILE"
        if [ -n "$ZIP_FILE" ]; then
          rm -rf /tmp/wp_deploy 2>/dev/null || true
          mkdir -p /tmp/wp_deploy
          unzip -o "$ZIP_FILE" -d /tmp/wp_deploy/
          cp -r /tmp/wp_deploy/public/* "$TARGET_DIR/"
          rm -rf /tmp/wp_deploy/ "$ZIP_FILE" 2>/dev/null || true
          echo "DEPLOY_COMPLETE"
        else
          echo "Error: deploy_public_html.zip not found"
        fi
      `;

      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error('Exec error:', err);
          conn.end();
          return;
        }

        stream.on('close', (code, signal) => {
          console.log(`Extraction process finished with code ${code}`);
          conn.end();
        }).on('data', (data) => {
          console.log('Remote STDOUT: ' + data.toString().trim());
        }).stderr.on('data', (data) => {
          console.error('Remote STDERR: ' + data.toString().trim());
        });
      });
    });
  });
}).on('error', (err) => {
  console.error('Connection Error:', err);
}).connect(config);
