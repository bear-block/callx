package com.callx

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.button.MaterialButton
import com.google.android.material.imageview.ShapeableImageView
import java.util.*

class IncomingCallActivity : AppCompatActivity() {

    // UI Components
    private lateinit var callerAvatar: ShapeableImageView
    private lateinit var callerName: TextView
    private lateinit var callerPhone: TextView
    private lateinit var callDuration: TextView
    private lateinit var answerButton: FloatingActionButton
    private lateinit var declineButton: FloatingActionButton
    private lateinit var messageButton: MaterialButton
    private lateinit var remindMeButton: MaterialButton

    // Call data
    private var callId: String = ""
    private var callerNameText: String = ""
    private var callerPhoneText: String = ""
    private var callerAvatarUrl: String? = null

    // Timer for call duration
    private var callStartTime: Long = 0
    private var durationTimer: Timer? = null

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
        
        // Start call timer
        startCallTimer()
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
        callDuration = findViewById(R.id.tv_call_duration)
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
        
        // Initially hide call duration
        callDuration.visibility = View.GONE
    }

    private fun loadCallerAvatar() {
        // TODO: Implement image loading (Glide, Picasso, etc.)
        // For now, use default avatar
        callerAvatar.setImageResource(R.drawable.default_avatar)
        
        // If avatar URL is provided, load it
        callerAvatarUrl?.let { url ->
            // TODO: Load image from URL
            // Example with Glide:
            // Glide.with(this)
            //     .load(url)
            //     .placeholder(R.drawable.default_avatar)
            //     .error(R.drawable.default_avatar)
            //     .into(callerAvatar)
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

    private fun startCallTimer() {
        callStartTime = System.currentTimeMillis()
        durationTimer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    runOnUiThread {
                        updateCallDuration()
                    }
                }
            }, 1000, 1000) // Update every second
        }
    }

    private fun updateCallDuration() {
        val elapsed = System.currentTimeMillis() - callStartTime
        val seconds = (elapsed / 1000) % 60
        val minutes = (elapsed / (1000 * 60)) % 60
        
        callDuration.text = String.format("%02d:%02d", minutes, seconds)
        callDuration.visibility = View.VISIBLE
    }

    private fun handleAnswerCall() {
        // Stop timer
        durationTimer?.cancel()
        
        // Send answer event to module
        CallxModule.onCallAnswered(callId, callerNameText)
        
        // TODO: Transition to in-call UI or finish activity
        finish()
    }

    private fun handleDeclineCall() {
        // Stop timer
        durationTimer?.cancel()
        
        // Send decline event to module
        CallxModule.onCallDeclined(callId, callerNameText)
        
        // Finish activity
        finish()
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

    override fun onDestroy() {
        super.onDestroy()
        durationTimer?.cancel()
    }

    override fun onBackPressed() {
        // Prevent back button from closing call screen
        // User must explicitly answer or decline
    }
} 