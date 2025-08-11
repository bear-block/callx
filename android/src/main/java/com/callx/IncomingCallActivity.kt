package com.callx

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.interpolator.view.animation.FastOutSlowInInterpolator
import com.google.android.material.floatingactionbutton.FloatingActionButton
import android.widget.FrameLayout
import com.google.android.material.button.MaterialButton
import com.google.android.material.imageview.ShapeableImageView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestOptions

class IncomingCallActivity : AppCompatActivity() {

    // UI Components
    private lateinit var callerAvatar: ShapeableImageView
    private lateinit var callerName: TextView
    private lateinit var callerPhone: TextView
    private lateinit var answerButton: FrameLayout
    private lateinit var declineButton: FrameLayout
    private lateinit var messageButton: MaterialButton
    private lateinit var remindMeButton: MaterialButton

    // Call data
    private var callId: String = ""
    private var callerNameText: String = ""
    private var callerPhoneText: String = ""
    private var callerAvatarUrl: String? = null
    
    // Media and vibration
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    
    // Flag to check if launched from notification
    private var launchedFromNotification: Boolean = false

    companion object {
        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_CALLER_NAME = "caller_name" 
        const val EXTRA_CALLER_PHONE = "caller_phone"
        const val EXTRA_CALLER_AVATAR = "caller_avatar"

        fun createIntent(
            context: Context,
            callId: String,
            callerName: String,
            callerPhone: String,
            callerAvatar: String? = null
        ): Intent {
            return Intent(context, IncomingCallActivity::class.java).apply {
                putExtra(EXTRA_CALL_ID, callId)
                putExtra(EXTRA_CALLER_NAME, callerName)
                putExtra(EXTRA_CALLER_PHONE, callerPhone)
                putExtra(EXTRA_CALLER_AVATAR, callerAvatar)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                       Intent.FLAG_ACTIVITY_CLEAR_TOP or
                       Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check for direct action first
        handleDirectAction()
        
        // Set content view first
        setContentView(R.layout.activity_incoming_call)
        
        // Setup full screen call UI
        setupFullScreenCall()
        
        // Initialize UI components
        initializeViews()
        
        // Get call data from intent
        extractCallData()
        
        // Setup UI with call data
        setupCallUI()
        
        // Setup button listeners
        setupButtonListeners()
        
        // Start ringtone and vibration
        startRingtoneAndVibration()
    }

    private fun handleDirectAction() {
        intent?.getStringExtra("action")?.let { action ->
            val callId = intent?.getStringExtra(EXTRA_CALL_ID) ?: ""
            val shouldLaunchApp = intent?.getBooleanExtra("launch_app", false) ?: false
            
            android.util.Log.d("IncomingCallActivity", "🎬 Direct action: $action for call: $callId, launch_app: $shouldLaunchApp")
            when (action) {
                "answer" -> {
                    android.util.Log.d("IncomingCallActivity", "📞 Direct answer action - dismissing notification")
                    // Dismiss notification first
                    CallxModule.onCallAnswered(callId, "")
                    
                    // Launch app if requested (from notification)
                    if (shouldLaunchApp) {
                        android.util.Log.d("IncomingCallActivity", "🚀 Launching main app after answer")
                        launchMainApp()
                    }
                    
                    finish()
                    return
                }
                "decline" -> {
                    android.util.Log.d("IncomingCallActivity", "❌ Direct decline action - stopping notification ringtone")
                    CallxModule.onCallDeclined(callId, "")
                    finish()
                    return
                }
                "dismiss" -> {
                    android.util.Log.d("IncomingCallActivity", "🛑 Direct dismiss action - closing UI without decline event")
                    // Just close UI cleanly (used for missed/cancelled)
                    stopRingtoneAndVibration()
                    finish()
                    return
                }
            }
        }
    }

    private fun setupFullScreenCall() {
        // Show when device is locked
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Full screen flags - remove layout flags and use modern approach
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Modern API - hide status and navigation bars completely
            window.insetsController?.let { controller ->
                controller.hide(
                    android.view.WindowInsets.Type.statusBars() or
                    android.view.WindowInsets.Type.navigationBars()
                )
                controller.systemBarsBehavior = 
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
            // Ensure content extends behind system bars (suppress deprecated warning)
            @Suppress("DEPRECATION")
            window.setDecorFitsSystemWindows(false)
        } else {
            // Legacy API for older Android versions
            @Suppress("DEPRECATION")
            window.decorView?.let { decorView ->
                decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
            }
        }
    }

    private fun initializeViews() {
        callerAvatar = findViewById(R.id.iv_caller_avatar)
        callerName = findViewById(R.id.tv_caller_name)
        callerPhone = findViewById(R.id.tv_caller_phone)
        answerButton = findViewById(R.id.fab_answer)
        declineButton = findViewById(R.id.fab_decline)
        messageButton = findViewById(R.id.btn_message)
        remindMeButton = findViewById(R.id.btn_remind_me)
    }

    private fun extractCallData() {
        intent?.let { intent ->
            callId = intent.getStringExtra(EXTRA_CALL_ID) ?: ""
            callerNameText = intent.getStringExtra(EXTRA_CALLER_NAME) ?: "Unknown Caller"
            callerPhoneText = intent.getStringExtra(EXTRA_CALLER_PHONE) ?: "No Number"
            callerAvatarUrl = intent.getStringExtra(EXTRA_CALLER_AVATAR)
            
            // Check if launched from notification (full screen intent)
            // This happens when app is in background/killed and notification launches activity
            launchedFromNotification = (intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0
            
            android.util.Log.d("IncomingCallActivity", "🔍 Launch detection:")
            android.util.Log.d("IncomingCallActivity", "   - Intent flags: ${intent.flags}")
            android.util.Log.d("IncomingCallActivity", "   - Launched from notification: $launchedFromNotification")
        }
    }

    private fun setupCallUI() {
        // Set caller information
        callerName.text = callerNameText
        callerPhone.text = callerPhoneText
        
        // Load caller avatar
        loadCallerAvatar()
        
        // Start entrance animations
        startEntranceAnimations()
    }

    private fun loadCallerAvatar() {
        val requestOptions = RequestOptions()
            .placeholder(R.drawable.default_avatar)
            .error(R.drawable.default_avatar)
            .fallback(R.drawable.default_avatar)
            .diskCacheStrategy(DiskCacheStrategy.ALL)
            .centerCrop()
            .override(160, 160) // Image size inside the 168dp container
        
        if (!callerAvatarUrl.isNullOrEmpty()) {
            // Load avatar from URL with Glide
            try {
                Glide.with(this)
                    .load(callerAvatarUrl)
                    .apply(requestOptions)
                    .into(callerAvatar)
            } catch (e: Exception) {
                android.util.Log.e("IncomingCallActivity", "Error loading avatar", e)
                callerAvatar.setImageResource(R.drawable.default_avatar)
            }
        } else {
            // Use default avatar  
            Glide.with(this)
                .load(R.drawable.default_avatar)
                .apply(requestOptions)
                .into(callerAvatar)
        }
    }

    private fun setupButtonListeners() {
        answerButton.setOnClickListener {
            handleAnswerCall()
        }

        declineButton.setOnClickListener {
            handleDeclineCall()
        }

        messageButton.setOnClickListener {
            handleMessageAction()
        }

        remindMeButton.setOnClickListener {
            handleRemindMeAction()
        }
    }

    private fun handleAnswerCall() {
        stopRingtoneAndVibration()
        animateButtonPress(answerButton) {
            android.util.Log.d("IncomingCallActivity", "📞 Call answered - launching main app")
            // Send answer event to module - this will stop notification ringtone
            try {
                val module = CallxModule.getInstance()
                if (module != null) {
                    CallxModule.onCallAnswered(callId, callerNameText)
                } else {
                    CallxStorage.savePendingAction(applicationContext, "answer", CallData(callId, callerNameText, callerPhoneText, callerAvatarUrl))
                }
            } catch (_: Exception) {
                CallxStorage.savePendingAction(applicationContext, "answer", CallData(callId, callerNameText, callerPhoneText, callerAvatarUrl))
            }
            
            // Launch main app and finish this activity
            launchMainApp()
            finish()
        }
    }

    private fun handleDeclineCall() {
        stopRingtoneAndVibration()
        animateButtonPress(declineButton) {
            android.util.Log.d("IncomingCallActivity", "❌ Call declined - notifying module to stop notification ringtone")
            // Send decline event to module - this will stop notification ringtone
            try {
                val module = CallxModule.getInstance()
                if (module != null) {
                    CallxModule.onCallDeclined(callId, callerNameText)
                } else {
                    CallxStorage.savePendingAction(applicationContext, "decline", CallData(callId, callerNameText, callerPhoneText, callerAvatarUrl))
                }
            } catch (_: Exception) {
                CallxStorage.savePendingAction(applicationContext, "decline", CallData(callId, callerNameText, callerPhoneText, callerAvatarUrl))
            }
            
            // Finish activity
            finish()
        }
    }

    private fun handleMessageAction() {
        // Note: Quick message functionality not implemented yet
        // Declining call for now - could be extended to show message templates
        handleDeclineCall()
    }

    private fun handleRemindMeAction() {
        // Note: Remind me functionality not implemented yet  
        // Declining call for now - could be extended to set reminders
        handleDeclineCall()
    }

    private fun startEntranceAnimations() {
        // Initially hide elements
        callerAvatar.alpha = 0f
        callerAvatar.scaleX = 0.3f
        callerAvatar.scaleY = 0.3f
        
        callerName.alpha = 0f
        callerName.translationY = 100f
        
        callerPhone.alpha = 0f
        callerPhone.translationY = 50f
        
        answerButton.alpha = 0f
        declineButton.alpha = 0f
        
        // Animate avatar
        val avatarAnimator = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(callerAvatar, "alpha", 0f, 1f),
                ObjectAnimator.ofFloat(callerAvatar, "scaleX", 0.3f, 1.1f, 1f),
                ObjectAnimator.ofFloat(callerAvatar, "scaleY", 0.3f, 1.1f, 1f)
            )
            duration = 600
            interpolator = FastOutSlowInInterpolator()
        }
        
        // Animate name
        val nameAnimator = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(callerName, "alpha", 0f, 1f),
                ObjectAnimator.ofFloat(callerName, "translationY", 100f, 0f)
            )
            duration = 500
            interpolator = DecelerateInterpolator()
            startDelay = 200
        }
        
        // Animate phone
        val phoneAnimator = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(callerPhone, "alpha", 0f, 1f),
                ObjectAnimator.ofFloat(callerPhone, "translationY", 50f, 0f)
            )
            duration = 400
            interpolator = DecelerateInterpolator()
            startDelay = 300
        }
        
        // Simple fade in for buttons
        val buttonsAnimator = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(answerButton, "alpha", 0f, 1f),
                ObjectAnimator.ofFloat(declineButton, "alpha", 0f, 1f)
            )
            duration = 500
            interpolator = DecelerateInterpolator()
            startDelay = 800
        }
        
        // Start all animations
        avatarAnimator.start()
        nameAnimator.start()
        phoneAnimator.start()
        buttonsAnimator.start()
        
        // Start pulsing animation for avatar
        startAvatarPulseAnimation()
        
        // Start button idle animations
        startButtonIdleAnimations()
    }
    
    private fun startAvatarPulseAnimation() {
        val pulseAnimator = ObjectAnimator.ofFloat(callerAvatar, "alpha", 1f, 0.7f, 1f).apply {
            duration = 2000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
        }
        pulseAnimator.start()
    }
    
    private fun startButtonIdleAnimations() {
        // Subtle breathing animation for answer button
        val answerBreath = ObjectAnimator.ofFloat(answerButton, "scaleX", 1f, 1.05f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            startDelay = 1000
        }
        
        val answerBreathY = ObjectAnimator.ofFloat(answerButton, "scaleY", 1f, 1.05f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            startDelay = 1000
        }
        
        // Subtle breathing animation for decline button
        val declineBreath = ObjectAnimator.ofFloat(declineButton, "scaleX", 1f, 1.03f, 1f).apply {
            duration = 3500
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            startDelay = 1200
        }
        
        val declineBreathY = ObjectAnimator.ofFloat(declineButton, "scaleY", 1f, 1.03f, 1f).apply {
            duration = 3500
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            startDelay = 1200
        }
        
        answerBreath.start()
        answerBreathY.start()
        declineBreath.start()
        declineBreathY.start()
    }
    
    private fun animateButtonPress(button: FrameLayout, onComplete: () -> Unit) {
        val scaleDown = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(button, "scaleX", 1f, 0.8f),
                ObjectAnimator.ofFloat(button, "scaleY", 1f, 0.8f)
            )
            duration = 100
            interpolator = AccelerateDecelerateInterpolator()
        }
        
        val scaleUp = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(button, "scaleX", 0.8f, 1f),
                ObjectAnimator.ofFloat(button, "scaleY", 0.8f, 1f)
            )
            duration = 100
            interpolator = AccelerateDecelerateInterpolator()
        }
        
        scaleDown.start()
        scaleDown.addListener(object : android.animation.Animator.AnimatorListener {
            override fun onAnimationStart(animation: android.animation.Animator) {}
            override fun onAnimationEnd(animation: android.animation.Animator) {
                scaleUp.start()
                onComplete()
            }
            override fun onAnimationCancel(animation: android.animation.Animator) {}
            override fun onAnimationRepeat(animation: android.animation.Animator) {}
        })
    }

    private fun startRingtoneAndVibration() {
        try {
            android.util.Log.d("IncomingCallActivity", "🎵 Starting ringtone and vibration...")
            android.util.Log.d("IncomingCallActivity", "   - Launched from notification: $launchedFromNotification")
            
            // Only start ringtone if NOT launched from notification
            // Because notification already has looping ringtone with FLAG_INSISTENT
            if (!launchedFromNotification) {
                android.util.Log.d("IncomingCallActivity", "🎵 Starting activity ringtone (foreground launch)")
                // Start ringtone
                val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                mediaPlayer = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setLegacyStreamType(AudioManager.STREAM_RING)
                            .build()
                    )
                    setDataSource(this@IncomingCallActivity, ringtoneUri)
                    isLooping = true
                    prepareAsync()
                    setOnPreparedListener { 
                        start()
                    }
                }
            } else {
                android.util.Log.d("IncomingCallActivity", "🔇 Skipping activity ringtone (notification already playing looping ringtone)")
            }
            
            // Only start vibration if NOT launched from notification (to avoid overlapping)
            // Because notification already has vibration pattern
            if (!launchedFromNotification) {
                android.util.Log.d("IncomingCallActivity", "📳 Starting activity vibration (foreground launch)")
                vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                    vibratorManager.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                }
                
                // Vibration pattern: [delay, vibrate, pause, vibrate, ...]
                val vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000)
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val vibrationEffect = VibrationEffect.createWaveform(vibrationPattern, 0)
                    vibrator?.vibrate(vibrationEffect)
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(vibrationPattern, 0)
                }
            } else {
                android.util.Log.d("IncomingCallActivity", "📳 Skipping activity vibration (notification already vibrating)")
            }
            
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "Error starting ringtone/vibration", e)
        }
    }
    
    private fun stopRingtoneAndVibration() {
        try {
            android.util.Log.d("IncomingCallActivity", "🔇 Stopping ringtone and vibration...")
            
            // Only stop ringtone if we started it (not launched from notification)
            if (!launchedFromNotification && mediaPlayer != null) {
                android.util.Log.d("IncomingCallActivity", "🔇 Stopping activity ringtone")
                mediaPlayer?.apply {
                    if (isPlaying) {
                        stop()
                    }
                    release()
                }
                mediaPlayer = null
            } else {
                android.util.Log.d("IncomingCallActivity", "🔇 No activity ringtone to stop (using notification ringtone)")
            }
            
            // Only stop vibration if we started it (not launched from notification)
            if (!launchedFromNotification && vibrator != null) {
                android.util.Log.d("IncomingCallActivity", "📳 Stopping activity vibration")
                vibrator?.cancel()
                vibrator = null
            } else {
                android.util.Log.d("IncomingCallActivity", "📳 No activity vibration to stop (using notification vibration)")
            }
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "Error stopping ringtone/vibration", e)
        }
    }

    // Launch main app when call is answered
    private fun launchMainApp() {
        try {
            android.util.Log.d("IncomingCallActivity", "🚀 Launching main app...")
            
            // Get target package from config
            val targetPackage = getTargetPackageName()
            android.util.Log.d("IncomingCallActivity", "📦 Target package: $targetPackage")
            
            // Check if device is locked
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            val isLocked = keyguardManager.isKeyguardLocked
            
            android.util.Log.d("IncomingCallActivity", "🔒 Device locked: $isLocked")
            
            // Create direct intent to MainActivity (more reliable than launch intent)
            val targetMainActivity = getTargetMainActivity()
            val mainAppIntent = Intent().apply {
                setClassName(targetPackage, "${targetPackage}.${targetMainActivity}")
                addCategory(Intent.CATEGORY_LAUNCHER)
                
                // Strong flags for locked screen launch
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                       Intent.FLAG_ACTIVITY_CLEAR_TOP or
                       Intent.FLAG_ACTIVITY_SINGLE_TOP or
                       Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED or
                       Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                
                // Add call data for the app to handle
                putExtra("call_action", "answer")
                putExtra("call_id", callId)
                putExtra("caller_name", callerNameText)
                putExtra("from_incoming_call", true)
                putExtra("device_was_locked", isLocked)
            }
            
            // Always launch directly - MainActivity will handle lockscreen
            android.util.Log.d("IncomingCallActivity", "🚀 Starting MainActivity directly...")
            android.util.Log.d("IncomingCallActivity", "📦 Intent: $mainAppIntent")
            android.util.Log.d("IncomingCallActivity", "📦 Intent extras: ${mainAppIntent.extras}")
            
            try {
                startActivity(mainAppIntent)
                android.util.Log.d("IncomingCallActivity", "✅ MainActivity launched successfully")
            } catch (e: Exception) {
                android.util.Log.e("IncomingCallActivity", "❌ Failed to launch MainActivity: ${e.message}")
                // Fallback to launch intent
                fallbackLaunchApp()
            }
            
            // Additional: Try to bring app to foreground (CallKeep style)
            bringAppToForeground(targetPackage)
            
            android.util.Log.d("IncomingCallActivity", "✅ Main app launch initiated")
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "❌ Error launching main app", e)
            // Fallback to generic approach
            fallbackLaunchApp()
        }
    }

    private fun getTargetPackageName(): String {
        // Detect from application context
        return try {
            val appContext = applicationContext
            val appPackageName = appContext.packageName
            android.util.Log.d("IncomingCallActivity", "🔍 Auto-detected App Package: $appPackageName")
            appPackageName
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "❌ Error detecting App Package: ${e.message}")
            // Final fallback to current package name
            packageName
        }
    }

    private fun getTargetMainActivity(): String {
        // Detect via launch intent
        return try {
            val pkgManager = packageManager
            val appPackageName = getTargetPackageName()
            val launchIntent = pkgManager.getLaunchIntentForPackage(appPackageName)
            if (launchIntent != null && launchIntent.component != null) {
                val fullClassName = launchIntent.component!!.className
                val activityName = fullClassName.substringAfterLast(".")
                android.util.Log.d("IncomingCallActivity", "🔍 Auto-detected MainActivity: $activityName for package: $appPackageName")
                activityName
            } else {
                android.util.Log.w("IncomingCallActivity", "⚠️ Could not detect MainActivity for package: $appPackageName, using default")
                "MainActivity"
            }
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "❌ Error detecting MainActivity: ${e.message}")
            "MainActivity"
        }
    }

    private fun bringAppToForeground(targetPackage: String) {
        try {
            // Get ActivityManager to bring app to foreground
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            
            // For Android 5.1+ (API 22+), try to move task to front
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val tasks = activityManager.appTasks
                for (task in tasks) {
                    val taskInfo = task.taskInfo
                    if (taskInfo.baseActivity?.packageName == targetPackage) {
                        android.util.Log.d("IncomingCallActivity", "🔄 Moving task to front")
                        task.moveToFront()
                        break
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("IncomingCallActivity", "Could not bring app to foreground: ${e.message}")
        }
    }

    private fun fallbackLaunchApp() {
        try {
            android.util.Log.d("IncomingCallActivity", "🔄 Fallback launch...")
            val packageManager = packageManager
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "❌ Fallback launch failed", e)
        }
    }

    override fun onDestroy() {
        android.util.Log.d("IncomingCallActivity", "🏁 Activity destroying - cleaning up media")
        stopRingtoneAndVibration()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    @Suppress("MissingSuperCall")
    override fun onBackPressed() {
        // Prevent back button from closing call screen
        // User must explicitly answer or decline
        android.util.Log.d("IncomingCallActivity", "⬅️ Back button pressed - ignoring (must answer/decline)")
        // Intentionally NOT calling super.onBackPressed() to prevent closing the activity
    }
} 