import * as fs from 'fs';
import * as path from 'path';

/**
 * Copies assets required for the build (like schemas) from src/ into dist/.
 */
export async function copyAssets() {
  console.log('📦 Running asset copying routine...');
  try {
    const sourceFile = path.resolve(__dirname, 'db', 'schema.sql');
    const destinationDir = path.resolve(__dirname, '../..', 'dist/db'); // Relative to server/src/
    const destinationFile = path.join(destinationDir, 'schema.sql');

    // Ensure the destination directory exists first
    if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Check if source file exists before copying
    if (!fs.existsSync(sourceFile)) {
      console.error(`❌ Error: Source schema file not found at ${sourceFile}`);
      throw new Error('Schema file missing');
    }

    // Copy the file (synchronous is fine here as it's part of a build script)
    fs.copyFileSync(sourceFile, destinationFile);
    console.log('✅ Successfully copied schema.sql to dist/db/');

  } catch (error) {
    console.error('🛑 FATAL BUILD ERROR during asset copying:', error);
    // Re-throw to ensure the entire build process fails loudly if this step fails.
    throw new Error('Failed to copy necessary assets for build.');
  }
}