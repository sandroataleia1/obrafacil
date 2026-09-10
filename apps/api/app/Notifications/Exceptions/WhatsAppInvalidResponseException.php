<?php

namespace App\Notifications\Exceptions;

/** A 2xx response that doesn't have the shape the adapter expects. Not safe to assume "sent". */
class WhatsAppInvalidResponseException extends WhatsAppProviderException {}
