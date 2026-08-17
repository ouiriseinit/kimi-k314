// file-tree.js – Updated to respect .gitignore, ignore node_modules, and copy to clipboard

import * as fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

class FileSystemNode {
    constructor(name, type) {
        this.name = name;
        this.type = type; // 'file' or 'directory'
        this.children = [];
    }

    addChild(child) {
        this.children.push(child);
    }

    // Returns the tree as a string (without printing)
    getTreeString(prefix = "", isLast = true) {
        const connector = isLast ? "└── " : "├── ";
        let result = prefix + connector + this.name + (this.type === 'file' ? ' 📄' : ' 📁') + '\n';

        if (this.children.length > 0) {
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            for (let i = 0; i < this.children.length; i++) {
                result += this.children[i].getTreeString(newPrefix, i === this.children.length - 1);
            }
        }
        return result;
    }

    // Prints the tree to the console
    display(prefix = "", isLast = true) {
        console.log(this.getTreeString(prefix, isLast).slice(0, -1)); // remove trailing newline
    }
}

// Function to parse .gitignore file and return ignored patterns
function getGitIgnorePatterns(dirPath) {
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return [];

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

// Recursive function to read directory and create tree nodes
function buildTree(filePath) {
    try {
        const stat = fs.statSync(filePath);

        if (stat.isFile()) {
            return new FileSystemNode(path.basename(filePath), 'file');
        } else if (stat.isDirectory()) {
            const ignoredPatterns = getGitIgnorePatterns(filePath);

            let dirName;
            try {
                dirName = fs.readdirSync(filePath).filter(item => {
                    return item !== '.gitignore' &&
                           item !== 'node_modules' &&
                           !ignoredPatterns.some(pattern =>
                               path.basename(item) === pattern || item.startsWith(pattern + '/')
                           );
                });
            } catch (error) {
                console.error('Error reading directory:', error.message);
                return null;
            }

            const parentNode = new FileSystemNode(path.basename(filePath), 'directory');
            dirName.forEach(child => parentNode.addChild(buildTree(path.join(filePath, child))));
            return parentNode;
        }
    } catch (error) {
        console.error('Error reading path:', error.message);
        return null;
    }
}

// Copy text to clipboard using platform-specific commands
function copyToClipboard(text) {
    const platform = process.platform;
    let command;

    if (platform === 'darwin') {
        command = 'pbcopy';
    } else if (platform === 'win32') {
        command = 'clip';
    } else if (platform === 'linux') {
        // Try xclip, fallback to xsel if not found
        command = 'xclip -selection clipboard';
    } else {
        console.warn('Clipboard copy not supported on this platform.');
        return;
    }

    const child = exec(command, (error, stdout, stderr) => {
        if (error) {
            console.warn('Failed to copy to clipboard:', error.message);
            if (platform === 'linux') {
                console.warn('Make sure xclip or xsel is installed (e.g., sudo apt install xclip)');
            }
        } else {
            console.log('✅ Tree copied to clipboard!');
        }
    });

    child.stdin.write(text);
    child.stdin.end();
}

// --- Main execution ---
const root = buildTree(process.cwd());

if (root) {
    // Display in console
    root.display();

    // Build the full tree string and copy it
    const treeString = root.getTreeString();
    copyToClipboard(treeString);
} else {
    console.log('Failed to read directory');
}