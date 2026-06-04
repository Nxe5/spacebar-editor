//! OS keychain storage for cloud provider API keys (Spec 40 §3).

use keyring::Entry;

const SERVICE: &str = "sidebar-editor";

fn account_id(provider: &str) -> Result<String, String> {
    match provider {
        "anthropic" | "deepseek" => Ok(format!("cloud-api-key.{provider}")),
        _ => Err(format!("Unsupported provider for keychain: {provider}")),
    }
}

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &account_id(provider)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_cloud_api_key(provider: String, secret: String) -> Result<(), String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return delete_cloud_api_key(provider);
    }
    entry(&provider)?
        .set_password(trimmed)
        .map_err(|e| format!("Failed to save API key to keychain: {e}"))
}

#[tauri::command]
pub fn delete_cloud_api_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete API key from keychain: {e}")),
    }
}

#[tauri::command]
pub fn has_cloud_api_key(provider: String) -> Result<bool, String> {
    match entry(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Failed to read keychain: {e}")),
    }
}

#[tauri::command]
pub fn get_cloud_api_key(provider: String) -> Result<String, String> {
    entry(&provider)?
        .get_password()
        .map_err(|e| format!("Failed to read API key from keychain: {e}"))
}
