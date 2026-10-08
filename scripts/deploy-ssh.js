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
        mkdir -p domains/roofingclients.us/public_html 2>/dev/null || true
        # Determine public_html location
        TARGET_DIR="public_html"
        if [ -d "domains/roofingclients.us/public_html" ]; then
          TARGET_DIR="domains/roofingclients.us/public_html"
        fi
        echo "Target directory is: $TARGET_DIR"
        
        # Unzip into target directory
        unzip -o deploy_public_html.zip -d /tmp/wp_deploy/
        cp -r /tmp/wp_deploy/public/* "$TARGET_DIR/"
        rm -rf /tmp/wp_deploy/ deploy_public_html.zip
        echo "DEPLOY_COMPLETE"
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
