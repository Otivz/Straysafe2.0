import sys
import os
import io
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.system_setting import SystemSetting
from app.utils.ai_suggestions import is_gemini_enabled_in_db, generate_ai_suggestions
from app.utils.ai_matching import compare_animals_vision
import app.utils.ai_suggestions as ai_sugg_module
import app.routes.reports as reports_module

client = TestClient(app)

def create_dummy_image_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_admin_012_gemini_toggle_enforcement():
    print("\n--- Verifying TASK ADMIN-012: Enforce Global Gemini Toggle Across All Endpoints ---")
    db = SessionLocal()
    original_setting_state = True
    try:
        # 1. Fetch or create system setting
        setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
        if not setting:
            setting = SystemSetting(
                setting_key="gemini_vision_matching",
                setting_type="vision",
                is_enabled=True,
                description="Toggle between Google Gemini Vision AI and Rule-Based Matching"
            )
            db.add(setting)
            db.commit()
            db.refresh(setting)
        else:
            original_setting_state = setting.is_enabled

        # 2. Turn Gemini Vision OFF globally
        setting.is_enabled = False
        db.commit()

        # Verify database check
        assert is_gemini_enabled_in_db(db) is False, "is_gemini_enabled_in_db must return False"
        assert is_gemini_enabled_in_db() is False, "is_gemini_enabled_in_db() without args must return False"
        print("[PASS] 1. is_gemini_enabled_in_db returns False when setting is OFF")

        # 3. Setup guard to ensure 0 calls are made to Gemini
        gemini_called = [False]
        def forbidden_gemini_call(*args, **kwargs):
            gemini_called[0] = True
            raise AssertionError("CRITICAL VIOLATION: call_gemini_with_fallback was called while Gemini is turned OFF!")

        # Monkeypatch call_gemini_with_fallback across all modules
        orig_sugg_fallback = ai_sugg_module.call_gemini_with_fallback
        orig_reports_fallback = reports_module.call_gemini_with_fallback
        ai_sugg_module.call_gemini_with_fallback = forbidden_gemini_call
        reports_module.call_gemini_with_fallback = forbidden_gemini_call

        try:
            # 4. Test generate_ai_suggestions rule-based fallback
            sugg = generate_ai_suggestions(
                description="Aggressive stray dog lunged and bit a pedestrian on the leg causing bleeding wound",
                category_name="Aggressive Animal",
                media_animal_type="Dog"
            )
            assert sugg is not None, "Rule-based suggestions should return dict"
            assert sugg.get("ai_animal_type") == "Dog", f"Expected Dog, got {sugg.get('ai_animal_type')}"
            assert sugg.get("ai_suggested_risk_level") == "High Risk", "High risk expected for bite injury"
            assert gemini_called[0] is False, "Gemini must not be called in generate_ai_suggestions"
            print("[PASS] 2. generate_ai_suggestions uses rule-based fallback without invoking Gemini")

            # 5. Test compare_animals_vision returns None immediately
            dummy_img1 = Image.new("RGB", (50, 50), color="white")
            dummy_img2 = Image.new("RGB", (50, 50), color="black")
            comp = compare_animals_vision(dummy_img1, dummy_img2, {"species": "Dog"}, {"species": "Dog"})
            assert comp is None, "compare_animals_vision must return None when Gemini is disabled"
            assert gemini_called[0] is False, "Gemini must not be called in compare_animals_vision"
            print("[PASS] 3. compare_animals_vision returns None without invoking Gemini")

            # 6. Test POST /reports/analyze-media with local fallback
            img_bytes = create_dummy_image_bytes()
            res_analyze = client.post(
                "/reports/analyze-media",
                files={"file": ("test_dog.jpg", img_bytes, "image/jpeg")}
            )
            assert res_analyze.status_code == 200, f"Analyze media failed: {res_analyze.text}"
            analyze_data = res_analyze.json()
            assert analyze_data.get("verification_status") == "authentic", "Fallback should report authentic status"
            assert analyze_data.get("ai_photo_status") == "Analyzed with local vision sensor"
            assert gemini_called[0] is False, "Gemini must not be called in analyze_report_media"
            print("[PASS] 4. POST /reports/analyze-media falls back to local optical sensor without invoking Gemini")

            # 7. Test POST /reports/validate-images with multi-image submission
            res_val = client.post(
                "/reports/validate-images",
                files=[
                    ("files", ("test1.jpg", img_bytes, "image/jpeg")),
                    ("files", ("test2.jpg", img_bytes, "image/jpeg"))
                ]
            )
            assert res_val.status_code == 200, f"Validate images failed: {res_val.text}"
            val_data = res_val.json()
            assert val_data.get("valid") is True or val_data.get("error_type") == "no_animal", f"Unexpected response: {val_data}"
            assert gemini_called[0] is False, "Gemini must not be called in validate_report_images"
            print("[PASS] 5. POST /reports/validate-images skips Gemini similarity and per-image forensic checks")

        finally:
            ai_sugg_module.call_gemini_with_fallback = orig_sugg_fallback
            reports_module.call_gemini_with_fallback = orig_reports_fallback

        # 8. Restore Gemini Vision to ON and verify is_gemini_enabled_in_db returns True
        setting.is_enabled = True
        db.commit()
        assert is_gemini_enabled_in_db(db) is True, "is_gemini_enabled_in_db must return True after restore"
        print("[PASS] 6. Restored Gemini setting to ON and verified is_gemini_enabled_in_db returns True")

        print("=======================================================")
        print("     ALL TASK ADMIN-012 GEMINI GOVERNANCE TESTS PASSED! ")
        print("=======================================================\n")

    finally:
        # Revert to original setting
        setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
        if setting:
            setting.is_enabled = original_setting_state
            db.commit()
        db.close()

if __name__ == "__main__":
    test_admin_012_gemini_toggle_enforcement()
