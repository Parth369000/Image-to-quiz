import google.generativeai as genai
import os

GENAI_API_KEY = "AIzaSyC2rGm2ECGM_e_zgyAKVsbuNlsWgCrwnAw"
genai.configure(api_key=GENAI_API_KEY)

print("Listing models...")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(m.name)
except Exception as e:
    print(e)
