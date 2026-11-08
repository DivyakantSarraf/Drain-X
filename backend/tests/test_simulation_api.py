import pytest
from fastapi.testclient import TestClient


def test_simulation_state_endpoint(client: TestClient):
    resp = client.get("/api/v1/simulation/state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "mechanism" in data
    assert "system" in data


def test_scenario_lifecycle_and_step(client: TestClient):
    # Start GRADUAL_DEBRIS scenario
    start_resp = client.post("/api/v1/simulation/start", json={"scenario": "GRADUAL_DEBRIS", "seed": 42})
    assert start_resp.status_code == 200
    assert start_resp.json()["scenario"] == "GRADUAL_DEBRIS"

    # Step simulation
    step_resp = client.post("/api/v1/simulation/step?dt=0.5")
    assert step_resp.status_code == 200
    step_data = step_resp.json()["step_result"]
    assert step_data["scenario"] == "GRADUAL_DEBRIS"
    assert "h1" in step_data

    # Stop simulation
    stop_resp = client.post("/api/v1/simulation/stop")
    assert stop_resp.status_code == 200


def test_fault_injection_endpoint(client: TestClient):
    resp = client.post(
        "/api/v1/simulation/inject_fault",
        json={"fault_type": "WINCH_JAM", "sensor_id": "WINCH"}
    )
    assert resp.status_code == 200
    assert "WINCH_JAM" in resp.json()["message"]


def test_manual_mechanism_trigger_and_reset(client: TestClient):
    # Reset first to ensure IDLE
    client.post("/api/v1/simulation/mechanism/reset")

    # Trigger cycle
    trig_resp = client.post("/api/v1/simulation/mechanism/trigger")
    assert trig_resp.status_code == 200
    assert "initiated" in trig_resp.json()["message"]

    # Reset
    reset_resp = client.post("/api/v1/simulation/mechanism/reset")
    assert reset_resp.status_code == 200

def test_halted_scenario_does_not_advance_on_step(client: TestClient):
    client.post(
        "/api/v1/simulation/start",
        json={"scenario": "GRADUAL_DEBRIS", "seed": 42},
    )
    client.post("/api/v1/simulation/step?dt=0.5")

    client.post("/api/v1/simulation/stop")
    halted_state = client.get("/api/v1/simulation/state").json()
    halted_time = halted_state["simulation_time_s"]

    step_resp = client.post("/api/v1/simulation/step?dt=1.0")
    assert step_resp.status_code == 200

    final_state = client.get("/api/v1/simulation/state").json()
    assert final_state["simulation_time_s"] == halted_time
    assert final_state["is_running"] is False
