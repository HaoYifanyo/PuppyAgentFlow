import sys
import os

# Add the backend directory to sys.path for all test modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))