// file-tree.js – Updated to respect .gitignore

import * as fs from 'fs';
import path from 'path';

class FileSystemNode {
    constructor(name, type) {
        this.name = name;
        this.type = type; // 'file' or 'directory'
        this.children = [];
    }

    addChild(child) {
        this.children.push(child);
    }

    display(prefix = "", isLast = true) {
        const connector = isLast ? "└── " : "├── ";
        console.log(prefix + connector + this.name + (this.type === 'file' ? ' 📄' : ' 📁'));
        
        if (this.children.length > 0) {
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].display(newPrefix, i === this.children.length - 1);
            }
        }
    }
}

// Function to parse .gitignore file and return ignored patterns
function getGitIgnorePatterns(dirPath) {
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return [];

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    // Simple parsing: split by newlines and trim whitespace
    return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

// Recursive function to read directory and create tree nodes, respecting .gitignore
function buildTree(filePath) {
    try {
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
            return new FileSystemNode(path.basename(filePath), 'file');
        } else if (stat.isDirectory()) {
            // Get gitignore patterns for this directory
            const ignoredPatterns = getGitIgnorePatterns(filePath);
            
            let dirName;
            try {
                dirName = fs.readdirSync(filePath).filter(item => {
                    // Skip .gitignore itself and its parent directory reference
                    return item !== '.gitignore' && !ignoredPatterns.some(pattern => 
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

// Start building tree from current directory
const root = buildTree(process.cwd());
if (root) {
    root.display();
} else {
    console.log('Failed to read directory');
}