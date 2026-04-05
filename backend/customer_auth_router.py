import hashlib
import hmac
import os
import re
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
import bcrypt
import jwt

from backend.customer_schema import get_customer_db_connection

JWT_SECRET = os.getenv("JWT_SECRET", "truvak-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

router = APIRouter()
HTTP_BEARER_SCHEME = HTTPBearer()

# Configure logging
logger = logging.getLogger("truvak.customer.auth")

class CustomerRegisterRequest(BaseModel):
    email: str
    password: str
    pin_code: Optional[str] = None

    @validator('email')
    def validate_email(cls, v):
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', v):
            raise ValueError('Invalid email format')
        return v

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v

class CustomerLoginRequest(BaseModel):
    email: str
    password: str

class CustomerAuthResponse(BaseModel):
    customer_id_hash: str
    token: str
    pin_code: Optional[str]
    created_at: str

def hash_email_for_lookup(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()

def hash_email_for_id(email: str) -> str:
    CUSTOMER_SALT = os.getenv("CUSTOMER_SALT", "truvak-customer-salt")
    return hmac.new(CUSTOMER_SALT.encode(), email.lower().encode(), hashlib.sha256).hexdigest()

def create_jwt_token(customer_id_hash: str) -> str:
    payload = {
        'customer_id_hash': customer_id_hash,
        'exp': datetime.utcnow() + timedelta(days=JWT_EXPIRY_DAYS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload['customer_id_hash']
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_customer(credentials: HTTPAuthorizationCredentials = Depends(HTTP_BEARER_SCHEME)):
    try:
        customer_id_hash = verify_jwt_token(credentials.credentials)
        return customer_id_hash
    except HTTPException as e:
        raise HTTPException(status_code=e.status_code, detail="Unauthorized")

@router.post("/v1/customer/auth/register", response_model=CustomerAuthResponse)
async def register_customer(customer_request: CustomerRegisterRequest):
    db_connection = get_customer_db_connection()
    try:
        email_hash = hash_email_for_lookup(customer_request.email)
        customer_id_hash = hash_email_for_id(customer_request.email)

        cursor = db_connection.cursor()
        cursor.execute("SELECT id FROM customer_accounts WHERE email_hash = ?", (email_hash,))
        existing_account = cursor.fetchone()

        if existing_account:
            raise HTTPException(status_code=409, detail="Email already registered")

        # Hash password
        hashed_password = bcrypt.hashpw(customer_request.password.encode(), bcrypt.gensalt(12)).decode('utf-8')
        current_time = datetime.utcnow().isoformat()
        
        insert_query = """
            INSERT INTO customer_accounts (email_hash, customer_id_hash, password_hash, pin_code, created_at)
            VALUES (?, ?, ?, ?, ?)
        """
        cursor.execute(insert_query, (email_hash, customer_id_hash, hashed_password, customer_request.pin_code, current_time))
        db_connection.commit()

        token = create_jwt_token(customer_id_hash)

        return CustomerAuthResponse(
            customer_id_hash=customer_id_hash,
            token=token,
            pin_code=customer_request.pin_code,
            created_at=current_time
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "status_code": 500})
    finally:
        db_connection.close()

@router.post("/v1/customer/auth/login", response_model=CustomerAuthResponse)
async def login_customer(customer_request: CustomerLoginRequest):
    db_connection = get_customer_db_connection()
    try:
        email_hash = hash_email_for_lookup(customer_request.email)

        cursor = db_connection.cursor()
        cursor.execute("SELECT * FROM customer_accounts WHERE email_hash = ?", (email_hash,))
        account = cursor.fetchone()

        if not account or not bcrypt.checkpw(customer_request.password.encode(), account['password_hash'].encode() if isinstance(account['password_hash'], str) else account['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        customer_id_hash = account['customer_id_hash']
        current_time = datetime.utcnow().isoformat()
        update_query = """
            UPDATE customer_accounts
            SET last_active = ?
            WHERE customer_id_hash = ?
        """
        cursor.execute(update_query, (current_time, customer_id_hash))
        db_connection.commit()

        token = create_jwt_token(customer_id_hash)

        return CustomerAuthResponse(
            customer_id_hash=customer_id_hash,
            token=token,
            pin_code=account['pin_code'],
            created_at=account['created_at']
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "status_code": 500})
    finally:
        db_connection.close()

@router.get("/v1/customer/auth/me", response_model=CustomerAuthResponse)
async def get_current_customer_details(customer_id_hash: str = Depends(get_current_customer)):
    db_connection = get_customer_db_connection()
    try:
        cursor = db_connection.cursor()
        cursor.execute("SELECT * FROM customer_accounts WHERE customer_id_hash = ?", (customer_id_hash,))
        account = cursor.fetchone()

        if not account:
            raise HTTPException(status_code=401, detail="Unauthorized")

        return CustomerAuthResponse(
            customer_id_hash=account['customer_id_hash'],
            token="",  # Token is not returned for safety
            pin_code=account['pin_code'],
            created_at=account['created_at']
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get current customer error: {str(e)}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "status_code": 500})
    finally:
        db_connection.close()
