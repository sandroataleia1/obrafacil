<?php

namespace App\Notifications\Exceptions;

/** The request exceeded EVOLUTION_TIMEOUT_SECONDS before any response arrived. Recoverable — safe to retry. */
class WhatsAppTimeoutException extends WhatsAppProviderException {}
