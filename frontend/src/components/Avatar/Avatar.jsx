import { getInitials, getColor } from '../../utils/helpers'
import './Avatar.css'

export default function Avatar({ name, size = 36, pictureUrl }) {
  if (pictureUrl) {
    return (
      <img 
        src={pictureUrl} 
        alt={name} 
        className="avatar-img"
        style={{ width: size, height: size }}
      />
    )
  }

  const bgColor = getColor(name)
  const initials = getInitials(name)

  return (
    <div 
      className="avatar-placeholder"
      style={{ 
        width: size, 
        height: size,
        backgroundColor: bgColor,
        fontSize: size * 0.4
      }}
    >
      {initials}
    </div>
  )
}