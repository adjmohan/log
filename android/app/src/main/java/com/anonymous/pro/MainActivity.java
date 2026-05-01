package com.anonymous.pro;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private static final int FITNESS_PERMISSION_REQ = 1201;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		ensurePermissionsAndStartService();
	}

	private void ensurePermissionsAndStartService() {
		boolean needActivityRecognition = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
			&& ContextCompat.checkSelfPermission(this, "android.permission.ACTIVITY_RECOGNITION")
			!= PackageManager.PERMISSION_GRANTED;

		boolean needNotifications = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
			&& ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
			!= PackageManager.PERMISSION_GRANTED;

		boolean needCamera = ContextCompat.checkSelfPermission(this, "android.permission.CAMERA")
			!= PackageManager.PERMISSION_GRANTED;

		// Collect all permissions that still need to be granted
		java.util.List<String> permissionsNeeded = new java.util.ArrayList<>();
		if (needActivityRecognition) permissionsNeeded.add("android.permission.ACTIVITY_RECOGNITION");
		if (needNotifications) permissionsNeeded.add("android.permission.POST_NOTIFICATIONS");
		if (needCamera) permissionsNeeded.add("android.permission.CAMERA");

		if (!permissionsNeeded.isEmpty()) {
			ActivityCompat.requestPermissions(
				this,
				permissionsNeeded.toArray(new String[0]),
				FITNESS_PERMISSION_REQ
			);
			return;
		}

		startStepService();
	}

	private void startStepService() {

		Intent intent = new Intent(this, StepService.class);
		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				startForegroundService(intent);
			} else {
				startService(intent);
			}
		} catch (SecurityException ignored) {
			// Permissions were not granted yet; service will be started after permission callback.
		} catch (IllegalStateException ignored) {
			// Foreground service start can fail on aggressive OEM restrictions.
		}
	}

	@Override
	public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults);
		if (requestCode != FITNESS_PERMISSION_REQ) {
			return;
		}

		boolean allGranted = true;
		for (int result : grantResults) {
			if (result != PackageManager.PERMISSION_GRANTED) {
				allGranted = false;
				break;
			}
		}

		if (allGranted) {
			startStepService();
		}
	}
}
