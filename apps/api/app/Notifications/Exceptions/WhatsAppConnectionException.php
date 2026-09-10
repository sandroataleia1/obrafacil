<?php

namespace App\Notifications\Exceptions;

/** The request never reached the provider (DNS, refused connection, ...). Recoverable — safe to retry. */
class WhatsAppConnectionException extends WhatsAppProviderException {}
