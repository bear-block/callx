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
            when (action) {
                "answer" -> {
                    CallxModule.onCallAnswered(callId, "")
                    finish()
                    return
                }
                "decline" -> {
                    CallxModule.onCallDeclined(callId, "")
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

        // Full screen flags
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        
        // Hide navigation and status bars for immersive experience
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(
                android.view.WindowInsets.Type.statusBars() or
                android.view.WindowInsets.Type.navigationBars()
            )
        } else {
            @Suppress("DEPRECATION")
            window.decorView?.let { decorView ->
                decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
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
            // Send answer event to module
            CallxModule.onCallAnswered(callId, callerNameText)
            
            // TODO: Transition to in-call UI or finish activity
            finish()
        }
    }

    private fun handleDeclineCall() {
        stopRingtoneAndVibration()
        animateButtonPress(declineButton) {
            // Send decline event to module
            CallxModule.onCallDeclined(callId, callerNameText)
            
            // Finish activity
            finish()
        }
    }

    private fun handleMessageAction() {
        // TODO: Implement quick message functionality
        // For now, decline the call and open messaging
        handleDeclineCall()
    }

    private fun handleRemindMeAction() {
        // TODO: Implement remind me functionality
        // For now, decline the call
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
            
            // Start vibration
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
            
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "Error starting ringtone/vibration", e)
        }
    }
    
    private fun stopRingtoneAndVibration() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                }
                release()
            }
            mediaPlayer = null
            
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            android.util.Log.e("IncomingCallActivity", "Error stopping ringtone/vibration", e)
        }
    }

    override fun onDestroy() {
        stopRingtoneAndVibration()
        super.onDestroy()
    }

    override fun onBackPressed() {
        // Prevent back button from closing call screen
        // User must explicitly answer or decline
    }
} 