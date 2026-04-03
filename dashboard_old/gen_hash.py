from streamlit_authenticator.utilities.hasher import Hasher

hashed = Hasher.hash("Trust@2024")
print(hashed)
