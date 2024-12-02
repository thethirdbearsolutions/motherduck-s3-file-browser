import { MDConnection } from '@motherduck/wasm-client';

const APP_URL = new URL(window.location);
APP_URL.hash = '#tokenInClipboard=true';

class MotherDuckFileBrowser {

    constructor (mdToken, bucket) {
        this.connection = MDConnection.create({
            mdToken
        });
        this.bucket = bucket;
    }
    
    buildFileTree (files) {
        // First create a nested object structure
        const tree = {};
        
        files.forEach(({file}) => {
            // Remove the s3:// prefix and split into parts
            const parts = file.replace(`s3://${this.bucket}/`, '').split('/');
            let current = tree;
            
            // Build nested object structure
            parts.forEach((part, i) => {
                if (i === parts.length - 1) {
                    // It's a file
                    current[part] = null;
                } else {
                    // It's a directory
                    current[part] = current[part] || {};
                }
                current = current[part];
            });
        });

        // Function to recursively build sl-tree-items
        function buildTreeHTML(obj, name = '') {
            if (obj === null) {
                // File node
                return `
        <sl-tree-item>
          ${name}
        </sl-tree-item>`;
            }
            
            // Directory node
            const children = Object.entries(obj)
                  .map(([key, value]) => buildTreeHTML(value, key))
                  .join('');
            
            if (!name) {
                // Root level - just return the tree
                return `
        <sl-tree>
          ${children}
        </sl-tree>`;
            }
            
            return `
      <sl-tree-item>
        <sl-icon slot="expand-icon" name="folder"></sl-icon>
        ${name}
        ${children}
      </sl-tree-item>`;
        }

        return buildTreeHTML(tree);
    }
    
    static async promptForToken () {
        const modal = document.createElement('sl-dialog');
        modal.label = "MotherDuck connection";
        modal.innerHTML = `
<form>
  <a href="https://app.motherduck.com/token-request?appName=File+browser&returnTo=${encodeURIComponent(APP_URL)}">Get a token (this won‘t be saved anywhere, don’t worry)</a>
  <sl-input label="MotherDuck token"
            type="password" 
            name="token"
            password-toggle></sl-input>
  <sl-input label="S3 bucket"
            type="text"
            name="bucket"></sl-input>
  <button type="submit">Save settings</button>
</form>
        `;
        modal.open = true;
        document.body.append(modal);

        modal.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            modal.open = false;
            const form = new FormData(e.target),
                  token = form.get('token'),
                  bucket = form.get('bucket');
             
            const app = new MotherDuckFileBrowser(token, bucket);
            const { data } = await app.connection.evaluateQuery(
                `SELECT * FROM GLOB('s3://${bucket}/**')`
            );
            
            const files = data.toRows();
            const tree = app.buildFileTree(files);
            const div = document.createElement('div');
            div.innerHTML = tree;
            document.body.append(div);
        });

        if (window.location.hash === '#tokenInClipboard=true') {
            window.location.hash = '#';

            if (navigator.clipboard.readText) {
                modal.querySelector('[name=token]').value = await navigator.clipboard.readText();
                modal.querySelector('a').remove();
            } else {
                /* If the browser doesn't let us read from the clipboard directly,
                   we'll tell the user to paste it. */
                modal.querySelector('a').textContent = 'Paste the token from your clipboard below.';
                modal.querySelector('a').href = '';
            }
        }        
    }
};

document.addEventListener('DOMContentLoaded', MotherDuckFileBrowser.promptForToken);
