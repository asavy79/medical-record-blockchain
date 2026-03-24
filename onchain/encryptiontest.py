from ecies import encrypt, decrypt
from ecies.keys import PrivateKey

# 1. Generate keys (You can also import your MetaMask hex keys here)
secp_k = PrivateKey()
pub_key_hex = secp_k.public_key.to_hex()
priv_key_hex = secp_k.to_hex()

# 2. Encrypt a message using a Public Key
message = b"Patient Blood Type: O-"
encrypted_data = encrypt(pub_key_hex, message)

# 3. Decrypt a message using a Private Key
decrypted_data = decrypt(priv_key_hex, encrypted_data)

print(decrypted_data.decode()) # Prints: Patient Blood Type: O-