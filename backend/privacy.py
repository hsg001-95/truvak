import hmac
import hashlib
import os

# In production this would come from environment variables per merchant
DEFAULT_SALT = os.environ.get("MERCHANT_SALT", "dev-salt-change-in-production")

def hash_buyer_id(raw_buyer_id: str, merchant_salt: str = DEFAULT_SALT) -> str:
    """
    HMAC-SHA256 hash of buyer identifier with per-merchant salt.
    Same buyer ID + different merchant salt = completely different hash.
    Raw PII never leaves this function.
    """
    return hmac.new(
        merchant_salt.encode('utf-8'),
        raw_buyer_id.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def verify_hash(raw_buyer_id: str, expected_hash: str, merchant_salt: str = DEFAULT_SALT) -> bool:
    """
    Constant-time comparison to prevent timing attacks.
    """
    actual = hash_buyer_id(raw_buyer_id, merchant_salt)
    return hmac.compare_digest(actual, expected_hash)


if __name__ == "__main__":
    # ── Test: same buyer, two different merchants = two different hashes ──
    buyer_phone = "9876543210"

    merchant_A_salt = "merchant-amazon-seller-A"
    merchant_B_salt = "merchant-flipkart-seller-B"

    hash_A = hash_buyer_id(buyer_phone, merchant_A_salt)
    hash_B = hash_buyer_id(buyer_phone, merchant_B_salt)

    print("=== Privacy Module Test ===")
    print(f"Raw buyer ID     : {buyer_phone}")
    print(f"Hash (Merchant A): {hash_A}")
    print(f"Hash (Merchant B): {hash_B}")
    print(f"Hashes are different: {hash_A != hash_B}")
    print()

    # ── Test: same merchant, same buyer = same hash every time ──
    hash_A2 = hash_buyer_id(buyer_phone, merchant_A_salt)
    print(f"Hash (Merchant A again): {hash_A2}")
    print(f"Consistent across calls: {hash_A == hash_A2}")
    print()

    # ── Test: verification ──
    print(f"Verify correct ID  : {verify_hash(buyer_phone, hash_A, merchant_A_salt)}")
    print(f"Verify wrong ID    : {verify_hash('0000000000', hash_A, merchant_A_salt)}")
