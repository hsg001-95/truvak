import os
from dotenv import load_dotenv
from backend.shopify_integration import register_webhook, list_webhooks

load_dotenv()

NGROK_URL = "https://fatima-unconstrued-trigly.ngrok-free.dev"

print("=== Registering Shopify Webhooks ===\n")

# Register orders/create webhook
success = register_webhook(NGROK_URL, "orders/create")
print(f"orders/create : {'✅ Done' if success else '❌ Failed'}")

# Register orders/updated webhook  
success = register_webhook(NGROK_URL, "orders/updated")
print(f"orders/updated: {'✅ Done' if success else '❌ Failed'}")

# List all registered webhooks
print("\nAll registered webhooks:")
for wh in list_webhooks():
    print(f"  {wh['topic']} → {wh['address']}")
