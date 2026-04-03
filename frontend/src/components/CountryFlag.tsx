import "flag-icons/css/flag-icons.min.css";

interface CountryFlagProps {
  countryCode: string;
  size?: number;
  className?: string;
}

/**
 * Reusable country flag component using flag-icons CSS library
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "US", "CA")
 * @param size - Size of the flag in pixels (default: 24)
 * @param className - Additional CSS classes
 */
export function CountryFlag({ 
  countryCode, 
  size = 24, 
  className = "" 
}: CountryFlagProps) {
  if (!countryCode) {
    // Fallback to a default flag if no country code provided
    return (
      <span 
        className={`fi fi-xx ${className}`}
        style={{ 
          width: `${size}px`, 
          height: `${size * 0.75}px`,
          minWidth: `${size}px`,
          minHeight: `${size * 0.75}px`,
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
        }}
        title="Unknown"
        role="img"
        aria-label="Flag"
      />
    );
  }
  
  // Convert to lowercase for flag-icons CSS classes
  const flagCode = countryCode.toLowerCase();
  
  return (
    <span 
      className={`fi fi-${flagCode} ${className}`}
      style={{ 
        width: `${size}px`, 
        height: `${size * 0.75}px`, // Flag aspect ratio is 4:3
        minWidth: `${size}px`,
        minHeight: `${size * 0.75}px`,
        fontSize: `${size}px`,
        display: 'inline-block',
        verticalAlign: 'middle',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        flexShrink: 0,
        borderRadius: '2px',
        border: 'none',
        overflow: 'hidden',
      }}
      title={countryCode}
      role="img"
      aria-label={`Flag of ${countryCode}`}
    />
  );
}
