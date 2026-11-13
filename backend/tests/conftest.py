import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.state_store import state_store, StateStore


@pytest.fixture(autouse=True)
def reset_state_store():
    """Reset global state store between tests for full test isolation."""
    state_store.clear()
    state_store.set_mode("SIMULATION", reason="Test reset")
    yield
    state_store.clear()
    state_store.set_mode("SIMULATION", reason="Test teardown")


@pytest.fixture
def client():
    """Test client for FastAPI app."""
    return TestClient(app)


@pytest.fixture
def isolated_state_store():
    """An isolated state store instance for testing."""
    return StateStore()
